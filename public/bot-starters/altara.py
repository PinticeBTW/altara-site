import asyncio
import copy
import hashlib
import inspect
import math
import os
import re
import secrets
import stat
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

import httpx


DEFAULT_FUNCTIONS_URL = "https://tbbgwjmmaiclkhssimhf.supabase.co/functions/v1"
# Stage is preserved for a later release; no runtime setting enables it.
STAGE_RELEASE_ENABLED = False
EVENT_INTENTS = frozenset({"messages", "members", "message_content", "reactions", "voice_states", "direct_messages", "presence"})
DOMAIN_EVENT_HANDLERS = {
    "MESSAGE_CREATE": "message_create", "MESSAGE_UPDATE": "message_update", "MESSAGE_DELETE": "message_delete",
    "SERVER_MEMBER_ADD": "server_member_add", "SERVER_MEMBER_REMOVE": "server_member_remove", "SERVER_MEMBER_UPDATE": "server_member_update",
    "MESSAGE_REACTION_ADD": "reaction_add", "MESSAGE_REACTION_REMOVE": "reaction_remove",
    "VOICE_STATE_UPDATE": "voice_state_update", "PRESENCE_UPDATE": "presence_update",
    "THREAD_CREATE": "thread_create", "THREAD_UPDATE": "thread_update", "THREAD_MESSAGE_CREATE": "thread_message_create",
}
DIRECT_MESSAGE_EVENT_HANDLERS = {
    "DIRECT_MESSAGE_CREATE": "direct_message_create", "DIRECT_MESSAGE_UPDATE": "direct_message_update", "DIRECT_MESSAGE_DELETE": "direct_message_delete",
    "DIRECT_MESSAGE_REACTION_ADD": "direct_message_reaction_add", "DIRECT_MESSAGE_REACTION_REMOVE": "direct_message_reaction_remove", "DIRECT_MESSAGE_PIN_UPDATE": "direct_message_pin_update",
}
MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
ATTACHMENT_MIME_TYPES = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
    "pdf": "application/pdf", "txt": "text/plain", "mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg",
    "mp4": "video/mp4", "webm": "video/webm", "zip": "application/zip",
}


class AltaraAPIError(Exception):
    def __init__(self, message: str, status_code: int = 0, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details or {}


class AltaraEventFeedError(AltaraAPIError):
    def __init__(self, public_error: Exception, private_error: Exception, *other_errors: Exception):
        self.errors = tuple(
            original for error in (public_error, private_error, *other_errors)
            for original in (error.errors if isinstance(error, AltaraEventFeedError) else (error,))
        )
        status = 401 if any(_terminal_connection_error(error) for error in self.errors) else 0
        # Zero base interval extracts only the existing capped server retry hints.
        retry_after = max(_retry_delay(error, 0, 0.0) for error in self.errors)
        super().__init__("bot_event_feeds_failed", status, {"retry_after_seconds": retry_after})


class CommandContext:
    def __init__(self, client: "AltaraClient", event: Dict[str, Any]):
        self.client = client
        self.event = event
        self.id = str(event.get("id") or "")
        data = _as_dict(event.get("data"))
        self.command_type = _normalize_command_type(data.get('type', 'CHAT_INPUT'))
        self.command_name = _normalize_command_name(data.get("name"), self.command_type)
        options = data.get("options")
        self.options = options if isinstance(options, list) else []
        selected = _resolve_selected_command_path(self.options)
        self.subcommand_group, self.subcommand = selected['subcommandGroup'], selected['subcommand']
        self._selected_options = selected['options']
        self.resolved = _as_dict(data.get('resolved'))
        self.target_id = str(data.get('target_id') or '')
        self.target_user = _as_dict(self.resolved.get('users')).get(self.target_id) if self.command_type == 'USER' else None
        self.target_message = _as_dict(self.resolved.get('messages')).get(self.target_id) if self.command_type == 'MESSAGE' else None
        self.user = _as_dict(event.get("user"))
        self.server_id = str(event.get("server_id") or "")
        self.channel_id = str(event.get("channel_id") or "")
        self.replied = False
        self.private_response_attempted = False

    async def get_server_settings(self):
        return await self.client.get_server_settings(self.server_id)

    def option(self, name: str, default: Any = None) -> Any:
        key = _normalize_command_name(name)
        for option in self._selected_options:
            item = _as_dict(option)
            if _normalize_command_name(item.get("name")) == key:
                return item.get("value", default)
        return default

    async def reply(self, content: str = "", attachments: Optional[List[Dict[str, Any]]] = None, *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None, ephemeral: bool = False) -> Dict[str, Any]:
        # Keep privacy intent separate from successful RPC acceptance, including invalid flags.
        if ephemeral is not False:
            self.private_response_attempted = True
        result = await self.client.reply(self.id, content, attachments=attachments, embeds=embeds, components=components, allowed_mentions=allowed_mentions, ephemeral=ephemeral)
        self.replied = True
        return result

    async def show_modal(self, modal):
        self.private_response_attempted = True
        result = await self.client.show_modal(self.id, modal)
        self.replied = True
        return result

    async def send_message(self, content: str = "", attachments: Optional[List[Dict[str, Any]]] = None, *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return await self.client.send_message(self.server_id, self.channel_id, content, attachments=attachments, embeds=embeds, components=components, allowed_mentions=allowed_mentions)

    async def read_message_history(self, limit: int = 25) -> List[Dict[str, Any]]:
        return await self.client.read_message_history(self.server_id, self.channel_id, limit=limit)

    async def add_reaction(self, message_id: str, emoji: str) -> Dict[str, Any]:
        return await self.client.add_reaction(self.server_id, self.channel_id, message_id, emoji)

    async def remove_reaction(self, message_id: str, emoji: str) -> Dict[str, Any]:
        return await self.client.remove_reaction(self.server_id, self.channel_id, message_id, emoji)

    async def set_reaction(self, message_id: str, emoji: str, enabled: bool) -> Dict[str, Any]:
        return await self.client.set_reaction(self.server_id, self.channel_id, message_id, emoji, enabled)

    async def pin_message(self, message_id: str) -> Dict[str, Any]:
        return await self.client.pin_message(self.server_id, self.channel_id, message_id)

    async def unpin_message(self, message_id: str) -> Dict[str, Any]:
        return await self.client.unpin_message(self.server_id, self.channel_id, message_id)

    async def delete_message(self, message_id: str) -> Dict[str, Any]:
        return await self.client.delete_message(self.server_id, self.channel_id, message_id)

    async def edit_message(
        self,
        message_id: str,
        content: str,
        attachments: Optional[List[Dict[str, Any]]] = None,
        *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await self.client.edit_message(self.server_id, self.channel_id, message_id, content, attachments=attachments, embeds=embeds, components=components, allowed_mentions=allowed_mentions)

    async def join_voice(
        self,
        channel_id: str,
        *,
        publish_audio: bool = True,
        status: str = "",
    ) -> Dict[str, Any]:
        return await self.client.join_voice(self.server_id, channel_id or "", publish_audio=publish_audio, status=status, event_id=self.id)

    async def leave_voice(self, channel_id: str) -> Dict[str, Any]:
        return await self.client.leave_voice(self.server_id, channel_id or "", event_id=self.id)

    async def set_voice_status(self, channel_id: str, status: str) -> Dict[str, Any]:
        return await self.client.set_voice_status(self.server_id, channel_id or "", status, event_id=self.id)

    async def get_voice_state(self, channel_id: str) -> Dict[str, Any]:
        return await self.client.get_voice_state(self.server_id, channel_id or "", event_id=self.id)

    async def upload_attachment(self, file: Any = None, *, channel_id: Optional[str] = None, file_path: Any = None, file_name: Optional[str] = None, mime: Optional[str] = None) -> Dict[str, Any]:
        return await self.client.upload_attachment(self.server_id, self.channel_id if channel_id is None else channel_id,
                                                  file, file_path=file_path, file_name=file_name, mime=mime)

    async def capture_voice(self, channel_id: str = "", *, recording: bool = False) -> Dict[str, Any]:
        return await self.client.capture_voice(self.server_id, channel_id, event_id=self.id, recording=recording)

    async def admin_action(self, action: str, payload: Optional[Dict[str, Any]] = None, *, request_id: Optional[str] = None, **fields) -> Dict[str, Any]:
        return await self.client.admin_action(action, self.server_id, payload, request_id=request_id, **fields)

    async def surface_action(self, action: str, payload: Optional[Dict[str, Any]] = None, *, request_id: Optional[str] = None, **fields) -> Dict[str, Any]:
        if action.startswith(("thread_", "webhook_")) and "channel_id" not in fields and "channel_id" not in (payload or {}):
            fields["channel_id"] = self.channel_id
        return await self.client.surface_action(action, self.server_id, payload, request_id=request_id, **fields)


class EventContext:
    def __init__(self, client: "AltaraClient", event: Dict[str, Any]):
        self.client, self.event = client, event
        self._event_generation = client._event_generation
        self.id = event["id"]
        self.lease_id = str(event.get("lease_id") or "")
        self.type = event["type"]
        self.server_id = str(event.get("server_id") or "")
        self.channel_id = str(event.get("channel_id") or "")
        self.user = self.author = _as_dict(event.get("user"))
        data = _as_dict(event.get("data"))
        self.data = data
        self.message_id = str(data.get("message_id") or "")
        self.thread_id = str(data.get("thread_id") or "")
        self.content = data.get("content") if isinstance(data.get("content"), str) else None
        self.content_redacted = data.get("content_redacted") is not False
        self.joined_at = data.get("joined_at")
        self._direct_message_scope = None
        if self.type in DIRECT_MESSAGE_EVENT_HANDLERS:
            self.actor = _direct_message_actor(event)
            self._direct_message_scope = (self.server_id, self.user.get("id"), self.id, client._event_generation)

    async def get_server_settings(self):
        return await self.client.get_server_settings(self._direct_message_scope[0] if self._direct_message_scope else self.server_id)

    async def send_welcome(self, content: str, channel_id: str):
        if self._event_generation != self.client._event_generation:
            raise ValueError("event_expired")
        if self.type != "SERVER_MEMBER_ADD" or not all(_event_uuid(value) for value in (self.id, self.lease_id, self.server_id)):
            raise ValueError("invalid_welcome_event")
        if not _event_uuid(channel_id):
            raise ValueError("invalid_welcome_channel")
        if not isinstance(content, str) or not content.strip() or len(content) > 2000:
            raise ValueError("invalid_welcome_content")
        data = await self.client._call_function("altara-bot-surfaces", {"action": "settings_welcome", "server_id": self.server_id,
            "event_id": self.id, "lease_id": self.lease_id, "channel_id": channel_id, "content": content})
        if data.get("ok") is not True or not isinstance(data.get("sent"), bool) or (data.get("message_id") is not None and not _event_uuid(data["message_id"])):
            raise ValueError("invalid_welcome_response")
        return data

    async def send_message(self, content: str = "", channel_id: Optional[str] = None, *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if self._direct_message_scope:
            if channel_id is not None:
                raise ValueError("direct_message_channel_override_forbidden")
            return await self.reply(content, embeds=embeds, components=components, allowed_mentions=allowed_mentions)
        if self._event_generation != self.client._event_generation:
            raise ValueError("event_expired")
        if self.type in {"THREAD_CREATE", "THREAD_UPDATE", "THREAD_MESSAGE_CREATE"}:
            if channel_id is not None:
                raise ValueError("thread_channel_override_forbidden")
            return await self.reply(content, embeds=embeds, components=components, allowed_mentions=allowed_mentions)
        target = self.channel_id if channel_id is None else channel_id
        if not target:
            raise ValueError("event_channel_required")
        return await self.client.send_message(self.server_id, target, content, embeds=embeds, components=components, allowed_mentions=allowed_mentions)

    async def reply(self, content: str = "", *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if allowed_mentions is not None and (self._direct_message_scope or self.type in {"THREAD_CREATE", "THREAD_UPDATE", "THREAD_MESSAGE_CREATE"}):
            raise ValueError("private_surface_mentions_unsupported")
        if self._direct_message_scope:
            server, recipient, event_id, generation = self._direct_message_scope
            if generation != self.client._event_generation:
                raise ValueError("private_event_expired")
            if not all(_event_uuid(value) for value in (server, recipient, event_id)):
                raise ValueError("invalid_direct_message_event")
            return await self.client.send_direct_message(server, recipient, content, request_id=event_id, embeds=embeds, components=components)
        if self._event_generation != self.client._event_generation:
            raise ValueError("event_expired")
        if self.type in {"THREAD_CREATE", "THREAD_UPDATE", "THREAD_MESSAGE_CREATE"}:
            if not all(_event_uuid(value) for value in (self.id, self.server_id, self.channel_id, self.thread_id)):
                raise ValueError("invalid_thread_event")
            return await self.client.send_thread_message(
                self.server_id, channel_id=self.channel_id, thread_id=self.thread_id, request_id=self.id, content=str(content or ""),
                **({"embeds": embeds} if embeds is not None else {}), **({"components": components} if components is not None else {}),
            )
        return await self.send_message(content, embeds=embeds, components=components, allowed_mentions=allowed_mentions)



class AutocompleteContext(CommandContext):
    def __init__(self, client, event):
        super().__init__(client, event)
        self.focused = _resolve_selected_command_path(self.options)['focused']
        if self.command_type != 'CHAT_INPUT' or not self.focused or self.focused['type'] not in {'STRING', 'INTEGER', 'NUMBER'}:
            raise ValueError('invalid_autocomplete_event')
        self.response_attempted = False
        self._event_generation = client._event_generation

    async def respond(self, choices):
        if self._event_generation != self.client._event_generation:
            raise ValueError('event_expired')
        if self.replied or self.response_attempted:
            raise ValueError('autocomplete_already_responded')
        normalized = _normalize_choices(choices, self.focused['type'])
        self.response_attempted = True
        result = await self.client._call_function('altara-bot-respond', {'event_id': self.id, 'type': 'APPLICATION_COMMAND_AUTOCOMPLETE_RESULT', 'data': {'choices': normalized}})
        self.replied = True
        return result

    async def reply(self, *args, **kwargs):
        raise ValueError('autocomplete_requires_choices')

    async def show_modal(self, *args, **kwargs):
        raise ValueError('autocomplete_requires_choices')


class ComponentContext(CommandContext):
    def __init__(self, client, event):
        super().__init__(client, event)
        self._event_generation = client._event_generation
        data = _as_dict(event.get("data"))
        self.custom_id = str(data.get("custom_id") or "")
        self.values = data.get("values") if isinstance(data.get("values"), list) else []
        self.fields = _as_dict(data.get("fields"))
        self.message_id = str(event.get("message_id") or "")
        self.slash_event_id = str(event.get("slash_event_id") or "")
        self.type = event.get("type")
        self.lease_id = event.get("lease_id")
        self.source_kind = event.get('source_kind') or ''
        if self.source_kind and self.source_kind not in {'dm', 'thread'}:
            raise ValueError('invalid_component_source')
        self.source_message_id = str(event.get('source_message_id') or '')
        self.origin_server_id = str(event.get('origin_server_id') or '')
        self.direct_message_id = str(event.get('direct_message_id') or '')
        self.recipient_user_id = str(event.get('user_id') or '')
        self.thread_id = str(event.get('thread_id') or '')
        self.parent_channel_id = str(event.get('parent_channel_id') or '')
        if self.source_kind == 'dm' and (self.server_id or self.channel_id or not all(_event_uuid(v) for v in [self.source_message_id,self.origin_server_id,self.recipient_user_id,self.direct_message_id])):
            raise ValueError('invalid_component_source')
        if self.source_kind == 'thread' and (self.channel_id or not all(_event_uuid(v) for v in [self.source_message_id,self.server_id,self.thread_id,self.parent_channel_id])):
            raise ValueError('invalid_component_source')

    def is_button(self):
        return self.type == "MESSAGE_COMPONENT" and self.event.get("data", {}).get("component_type") == 2

    def is_string_select_menu(self):
        return self.type == "MESSAGE_COMPONENT" and self.event.get("data", {}).get("component_type") == 3

    def is_user_select_menu(self):
        return self.type == 'MESSAGE_COMPONENT' and self.event.get('data', {}).get('component_type') == 5

    def is_role_select_menu(self):
        return self.type == 'MESSAGE_COMPONENT' and self.event.get('data', {}).get('component_type') == 6

    def is_mentionable_select_menu(self):
        return self.type == 'MESSAGE_COMPONENT' and self.event.get('data', {}).get('component_type') == 7

    def is_channel_select_menu(self):
        return self.type == 'MESSAGE_COMPONENT' and self.event.get('data', {}).get('component_type') == 8

    def is_modal_submit(self):
        return self.type == "MODAL_SUBMIT"

    async def respond(self, response):
        if self._event_generation != self.client._event_generation:
            raise ValueError("event_expired")
        result = await self.client._call_function("altara-bot-components", {"action": "respond", "event_id": self.id, "lease_id": self.lease_id, "response": response, **({'source_kind': self.source_kind} if self.source_kind else {})})
        self.replied = True
        return result

    async def send_message(self, content='', attachments=None, *, embeds=None, components=None, allowed_mentions=None):
        if self.source_kind:
            if allowed_mentions is not None:
                raise ValueError('mentions_not_supported_on_surface')
            if self.source_kind == 'dm':
                return await self.client.send_direct_message(self.origin_server_id, self.recipient_user_id, content, attachments=attachments, embeds=embeds, components=components)
            return await self.client.send_thread_message(self.server_id, thread_id=self.thread_id, content=content, attachments=attachments, embeds=embeds, components=components)
        return await super().send_message(content, attachments, embeds=embeds, components=components, allowed_mentions=allowed_mentions)

    async def read_message_history(self, limit=25):
        if self.source_kind == 'dm':
            return await self.client.read_direct_message_history(self.origin_server_id, self.recipient_user_id)
        if self.source_kind == 'thread':
            return await self.client.read_thread(self.server_id, thread_id=self.thread_id, limit=limit)
        return await super().read_message_history(limit)

    async def upload_attachment(self, file=None, *, channel_id=None, file_path=None, file_name=None, mime=None):
        if self.source_kind == 'dm':
            return await self.client.upload_direct_message_attachment(self.origin_server_id, self.recipient_user_id, file, file_path=file_path, file_name=file_name, mime=mime)
        if self.source_kind == 'thread':
            return await self.client.upload_attachment(self.server_id, self.parent_channel_id, file, file_path=file_path, file_name=file_name, mime=mime)
        return await super().upload_attachment(file, channel_id=channel_id, file_path=file_path, file_name=file_name, mime=mime)

    async def reply(self, content="", *, embeds=None, components=None, ephemeral=False):
        if ephemeral is not False:
            self.private_response_attempted = True
        _validate_private_reply(ephemeral, None, components, None)
        # A public guild click/form owns its leased event; its private response
        # must not borrow a slash actor or fall back to a public message.
        if ephemeral:
            own_guild_event = not self.source_kind and self.type in {"MESSAGE_COMPONENT", "MODAL_SUBMIT"} and all(
                _event_uuid(value) for value in (self.id, self.lease_id, self.message_id, self.server_id, self.channel_id)
            )
            if not self.slash_event_id and not own_guild_event:
                raise ValueError("private_response_unsupported")
        response = {"action": "reply", "content": str(content or "")}
        if ephemeral:
            response["ephemeral"] = True
        if embeds is not None:
            response["embeds"] = embeds
        if components is not None:
            response["components"] = components
        return await self.respond(response)

    async def update(self, content=None, *, embeds=None, components=None):
        response = {"action": "update"}
        if content is not None:
            response["content"] = str(content)
        if embeds is not None:
            response["embeds"] = embeds
        if components is not None:
            response["components"] = components
        return await self.respond(response)

    async def show_modal(self, modal):
        return await self.respond({"action": "modal", "modal": modal})

    async def acknowledge(self):
        return await self.respond({"action": "ack"})


class AltaraClient:
    def __init__(
        self,
        token: Optional[str] = None,
        functions_url: Optional[str] = None,
        poll_interval: float = 1.0,
        batch_size: int = 5,
        intents: Optional[List[str]] = None,
        server_settings_features: Optional[List[str]] = None,
    ):
        self.token = str(token or os.getenv("ALTARA_BOT_TOKEN") or "").strip()
        self.functions_url = _normalize_functions_url(functions_url or os.getenv("ALTARA_FUNCTIONS_URL") or DEFAULT_FUNCTIONS_URL)
        self.token_prefix = _bot_token_prefix(self.token)
        self.poll_interval = max(float(poll_interval), 1.0)
        self.batch_size = min(max(int(batch_size), 1), 10)
        self._handlers: Dict[str, Callable[[CommandContext], Any]] = {}
        self._autocomplete_handlers: Dict[str, Callable] = {}
        self._command_definitions: Dict[str, Dict[str, Any]] = {}
        self._running = False
        self._client: Optional[httpx.AsyncClient] = None
        values = [] if intents is None else intents
        if not isinstance(values, (list, tuple)) or any(not isinstance(i, str) or i not in EVENT_INTENTS for i in values):
            raise ValueError("invalid_event_intents")
        self.intents = tuple(dict.fromkeys(values))
        if "message_content" in self.intents and "messages" not in self.intents:
            raise ValueError("message_content_requires_messages")
        self._event_handlers: Dict[str, List[Callable]] = {}
        self._event_acks: Dict[str, Dict[str, str]] = {}
        self._dm_acks: Dict[str, Dict[str, str]] = {}
        self._completed_events: Dict[str, float] = {}
        self._domain_in_flight = False
        self._dm_in_flight = False
        self._dropped_events = 0
        self._dm_dropped_events = 0
        self._event_generation = 0
        self.server_settings_features = None if server_settings_features is None else _normalize_server_settings_features(server_settings_features)
        self._server_settings_scope = None

    def on(self, name: str, handler: Callable) -> "AltaraClient":
        if name not in set(DOMAIN_EVENT_HANDLERS.values()) | set(DIRECT_MESSAGE_EVENT_HANDLERS.values()) | {"event_overflow", "error", "interaction_create"} or not callable(handler):
            raise ValueError("invalid_event_handler")
        self._event_handlers.setdefault(name, []).append(handler)
        return self

    def event(self, name: str) -> Callable:
        def decorator(handler: Callable) -> Callable:
            self.on(name, handler)
            return handler
        return decorator

    async def _emit_domain(self, name: str, value: Any, *, generation=None) -> None:
        for handler in self._event_handlers.get(name, []):
            if generation is not None and generation != self._event_generation:
                return
            result = handler(value)
            if inspect.isawaitable(result):
                await result

    async def _emit_observers(self, name: str, value: Any) -> None:
        # Diagnostic failures must not stop delivery or skip later observers.
        for handler in self._event_handlers.get(name, []):
            try:
                result = handler(value)
                if inspect.isawaitable(result):
                    await result
            except Exception as error:
                if name != "error" and self._event_handlers.get("error"):
                    await self._emit_observers("error", error)
                else:
                    print("[altara] error handler failed" if name == "error" else "[altara] event observer failed")

    def command(
        self,
        name: str,
        *,
        description: str = "",
        options: Optional[List[Dict[str, Any]]] = None,
        type: Any = 'CHAT_INPUT',
    ) -> Callable[[Callable[[CommandContext], Any]], Callable[[CommandContext], Any]]:
        definition = _normalize_command_definition(name, {'type': type, 'description': description, 'options': options if options is not None else []})
        key = _command_key(definition['name'], definition['type'])

        def decorator(handler: Callable[[CommandContext], Any]) -> Callable[[CommandContext], Any]:
            if not callable(handler):
                raise TypeError("command handler must be callable")
            self._handlers[key] = handler
            self._command_definitions[key] = definition
            return handler

        return decorator

    def autocomplete(self, name: str) -> Callable:
        key = _command_key(name)
        def decorator(handler):
            if not callable(handler):
                raise TypeError('autocomplete handler must be callable')
            self._autocomplete_handlers[key] = handler
            return handler
        return decorator

    def run(self) -> None:
        asyncio.run(self.start())

    def login(self) -> None:
        self.run()

    async def start(self) -> None:
        if not self.token:
            raise ValueError("ALTARA_BOT_TOKEN is required")
        if self._running or self._client is not None:
            return

        self._running = True
        stopped = asyncio.Event()
        self._stop_event = stopped
        print(f"[altara] functions endpoint: {self.functions_url}")
        print(f"[altara] token prefix: {self.token_prefix or 'invalid_token_format'}")

        async with httpx.AsyncClient(timeout=20.0) as client:
            self._client = client
            try:
                failures = 0
                while self._running:
                    try:
                        if self.server_settings_features is not None:
                            await self.register_server_settings(self.server_settings_features)
                        await self.sync_commands()
                        break
                    except Exception as error:
                        print(f"[altara] command sync failed: {error}")
                        if _terminal_connection_error(error):
                            self.stop()
                            return
                        failures += 1
                        await self._wait_for_poll(_retry_delay(error, failures, self.poll_interval), stopped)
                if not self._running:
                    return
                print("ALTARA bot connected in Bot Token Connection mode.")
                failures = 0
                while self._running:
                    delay = self.poll_interval
                    try:
                        await self.poll_once()
                        failures = 0
                    except Exception as error:
                        print(f"[altara] {error}")
                        if _terminal_connection_error(error):
                            self.stop()
                            return
                        failures += 1
                        delay = _retry_delay(error, failures, self.poll_interval)
                    await self._wait_for_poll(delay, stopped)
            finally:
                self._client = None
                self._running = False

    async def _wait_for_poll(self, delay: float, stopped: asyncio.Event) -> None:
        try:
            await asyncio.wait_for(stopped.wait(), timeout=delay)
        except asyncio.TimeoutError:
            pass

    def stop(self) -> None:
        self._running = False
        self._event_generation += 1
        stopped = getattr(self, "_stop_event", None)
        if stopped is not None:
            stopped.set()

    async def sync_commands(self) -> Dict[str, Any]:
        commands = list(self._command_definitions.values())
        data = await self._call_function("altara-bot-sync-commands", {
            "commands": commands,
            "disable_missing": True,
        })
        synced_count = int(data.get("synced_count") or len(commands))
        print(f"ALTARA synced {synced_count} command(s) from code.")
        return data

    async def register_server_settings(self, features: List[str]) -> Dict[str, Any]:
        requested = _normalize_server_settings_features(features)
        data = await self._call_function("altara-bot-surfaces", {"action": "settings_register", "features": requested})
        if (data.get("ok") is not True or not _event_uuid(data.get("bot_id")) or
                not _settings_revision(data.get("support_revision")) or _normalize_server_settings_features(data.get("features")) != requested):
            raise ValueError("invalid_server_settings_response")
        return copy.deepcopy(data)

    def _begin_server_settings_scope(self):
        if self._server_settings_scope is not None:
            return None
        scope = {"reads": {}, "generation": self._event_generation}
        self._server_settings_scope = scope
        return scope

    def _end_server_settings_scope(self, scope):
        if scope is not None and self._server_settings_scope is scope:
            self._server_settings_scope = None

    async def get_server_settings(self, server_id: str) -> Dict[str, Any]:
        server = str(server_id or "").strip().lower()
        if not _event_uuid(server):
            raise ValueError("invalid_server_id")
        scope = self._server_settings_scope
        async def read():
            data = await self._call_function("altara-bot-surfaces", {"action": "settings_get", "server_id": server})
            return _validate_server_settings(data, server)
        if scope is None:
            return copy.deepcopy(await read())
        if server not in scope["reads"]:
            scope["reads"][server] = asyncio.create_task(read())
        data = await scope["reads"][server]
        # Keep settings loaded for an old delivery from acting after stop/restart.
        if scope["generation"] != self._event_generation:
            raise ValueError("server_settings_scope_expired")
        return copy.deepcopy(data)

    async def poll_once(self) -> None:
        settings_scope = self._begin_server_settings_scope()
        try:
            generation = self._event_generation
            errors = []
            try:
                data = await self._call_function("altara-bot-poll-events", {"limit": self.batch_size})
            except Exception as error:
                if _terminal_connection_error(error):
                    raise
                errors.append(error)
            else:
                if generation != self._event_generation:
                    return
                events = data.get("events")
                for event in events if isinstance(events, list) else []:
                    if generation != self._event_generation:
                        return
                    try:
                        await self._dispatch_event(_as_dict(event))
                    except Exception as error:
                        print(f"[altara] event failed: {error}")

            # A temporary endpoint failure must not starve unrelated enabled feeds.
            # Keep delivery sequential and report failures after those feeds finish.
            async def poll_feed(poll):
                try:
                    await poll()
                except Exception as error:
                    if _terminal_connection_error(error):
                        if errors:
                            raise AltaraEventFeedError(*errors, error) from None
                        raise
                    errors.append(error)

            if self.intents and generation == self._event_generation:
                await poll_feed(self.poll_domain_events)
            if self._event_handlers.get("interaction_create") and generation == self._event_generation:
                await poll_feed(self.poll_component_events)
                if generation == self._event_generation:
                    await poll_feed(self.poll_native_component_events)
            if len(errors) == 1:
                raise errors[0]
            if errors:
                raise AltaraEventFeedError(*errors) from None

        finally:
            self._end_server_settings_scope(settings_scope)

    async def poll_native_component_events(self) -> None:
        await self.poll_component_events("dm")

    async def poll_component_events(self, source=None) -> None:
        generation = self._event_generation
        data = await self._call_function("altara-bot-components", {"action": "poll", "limit": min(self.batch_size, 5), **({"source_kind": source} if source else {})})
        if generation != self._event_generation:
            return
        if data.get("ok") is not True or not isinstance(data.get("events"), list):
            raise ValueError("invalid_component_event_response")
        for event in data["events"]:
            if generation != self._event_generation:
                break
            if not _event_uuid(event.get("id")) or not _event_uuid(event.get("lease_id")) or event.get("type") not in {"MESSAGE_COMPONENT", "MODAL_SUBMIT"}:
                raise ValueError("invalid_component_event")
            if (source and event.get("source_kind") not in ("dm", "thread")) or (not source and event.get("source_kind") is not None):
                raise ValueError("invalid_component_event_source")
            ctx = ComponentContext(self, event)
            try:
                await self._emit_domain("interaction_create", ctx, generation=generation)
                if generation == self._event_generation and not ctx.replied and not ctx.private_response_attempted:
                    await ctx.acknowledge()
            except Exception as error:
                await self._emit_observers("error", error)

    async def poll_domain_events(self) -> None:
        if self._domain_in_flight or not self.intents:
            return
        self._domain_in_flight = True
        settings_scope = self._begin_server_settings_scope()
        try:
            generation = self._event_generation
            intents = [intent for intent in self.intents if intent != "direct_messages"]
            domain_error = None
            if intents:
                try:
                    await self._poll_event_feed("altara-bot-events", {"intents": intents}, self._event_acks, DOMAIN_EVENT_HANDLERS, generation, False)
                except Exception as error:
                    if _terminal_connection_error(error):
                        raise
                    domain_error = error
            if "direct_messages" in self.intents and generation == self._event_generation:
                try:
                    await self.poll_direct_messages()
                except Exception as error:
                    if domain_error is None:
                        raise
                    raise AltaraEventFeedError(domain_error, error) from None
            if domain_error is not None:
                raise domain_error
        finally:
            self._end_server_settings_scope(settings_scope)
            self._domain_in_flight = False

    async def poll_direct_messages(self) -> None:
        if self._dm_in_flight or "direct_messages" not in self.intents:
            return
        self._dm_in_flight = True
        settings_scope = self._begin_server_settings_scope()
        try:
            await self._poll_event_feed(
                "altara-bot-surfaces", {"action": "dm_poll", "event_types": list(DIRECT_MESSAGE_EVENT_HANDLERS)}, self._dm_acks,
                DIRECT_MESSAGE_EVENT_HANDLERS, self._event_generation, True,
            )
        finally:
            self._end_server_settings_scope(settings_scope)
            self._dm_in_flight = False

    async def _poll_event_feed(self, endpoint, options, acknowledgements, handlers, generation, private):
        acks = list(acknowledgements.values())[:100]
        data = await self._call_function(endpoint, {**options, "limit": self.batch_size, "acknowledgements": acks})
        if generation != self._event_generation:
            return
        error_prefix = "direct_message" if private else "domain"
        if data.get("ok") is not True or not isinstance(data.get("events"), list):
            raise ValueError(f"invalid_{error_prefix}_event_response")
        events = data["events"]
        for event in events:
            item = _as_dict(event)
            if private:
                _validate_direct_message_event(event)
            elif not handlers.get(item.get("type")) or not _event_uuid(item.get("id")) or not _event_uuid(item.get("lease_id")):
                raise ValueError(f"invalid_{error_prefix}_event")
        for ack in acks:
            if acknowledgements.get(ack["id"]) == ack:
                acknowledgements.pop(ack["id"], None)
        dropped = int(data.get("dropped_events") or 0)
        previous = self._dm_dropped_events if private else self._dropped_events
        if private:
            self._dm_dropped_events = dropped
        else:
            self._dropped_events = dropped
        if dropped > previous:
            await self._emit_observers("event_overflow", {"dropped_events": dropped, "source": "direct_messages" if private else "domain"})
        for event in events:
            if generation != self._event_generation:
                return
            now = time.monotonic()
            self._completed_events = {key: at for key, at in self._completed_events.items() if now - at <= 600}
            key = f"{endpoint}:{event['id']}"
            try:
                if key not in self._completed_events:
                    await self._emit_domain(handlers[event["type"]], EventContext(self, event), generation=generation)
                    if generation != self._event_generation:
                        return
                    self._completed_events[key] = now
                    while len(self._completed_events) > 1000:
                        self._completed_events.pop(next(iter(self._completed_events)))
                acknowledgements[event["id"]] = {"id": event["id"], "lease_id": event["lease_id"]}
            except Exception as error:
                print("[altara] event handler failed")
                await self._emit_observers("error", error)

    async def reply(
        self,
        event_id: str,
        content: str = "",
        attachments: Optional[List[Dict[str, Any]]] = None,
        *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None, ephemeral: bool = False,
    ) -> Dict[str, Any]:
        _validate_private_reply(ephemeral, attachments, components, allowed_mentions)
        return await self._call_function("altara-bot-respond", {
            "event_id": event_id,
            "type": "CHANNEL_MESSAGE_WITH_SOURCE",
            **({"allowed_mentions": _normalize_allowed_mentions(allowed_mentions)} if allowed_mentions is not None else {}),
            "data": {
                "content": str(content or "")[:2000],
                **({"ephemeral": True} if ephemeral else {"attachments": attachments if isinstance(attachments, list) else []}),
                **({"embeds": embeds} if embeds is not None else {}),
                **({"components": components} if components is not None else {}),
            },
        })

    async def show_modal(self, event_id, modal):
        if not isinstance(modal, dict):
            raise ValueError("invalid_modal")
        return await self._call_function("altara-bot-respond", {"event_id": event_id, "type": 9, "data": {key: modal.get(key) for key in ("custom_id", "title", "components")}})

    async def send_message(
        self,
        server_id: str,
        channel_id: str,
        content: str = "",
        attachments: Optional[List[Dict[str, Any]]] = None,
        *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await self._message_action("send_message", server_id, channel_id, content=content, attachments=attachments, embeds=embeds, components=components, allowed_mentions=allowed_mentions)

    async def read_message_history(self, server_id: str, channel_id: str, limit: int = 25) -> List[Dict[str, Any]]:
        data = await self._message_action("history", server_id, channel_id, limit=limit)
        messages = data.get("messages")
        return messages if isinstance(messages, list) else []

    async def add_reaction(self, server_id: str, channel_id: str, message_id: str, emoji: str) -> Dict[str, Any]:
        return await self._message_action("add_reaction", server_id, channel_id, message_id=message_id, emoji=emoji)

    async def remove_reaction(self, server_id: str, channel_id: str, message_id: str, emoji: str) -> Dict[str, Any]:
        return await self._message_action("remove_reaction", server_id, channel_id, message_id=message_id, emoji=emoji)

    async def set_reaction(self, server_id: str, channel_id: str, message_id: str, emoji: str, enabled: bool) -> Dict[str, Any]:
        if type(enabled) is not bool:
            raise ValueError("invalid_reaction_enabled")
        return await self._message_action("set_reaction", server_id, channel_id, message_id=message_id, emoji=emoji, enabled=enabled)

    async def pin_message(self, server_id: str, channel_id: str, message_id: str) -> Dict[str, Any]:
        return await self._message_action("pin_message", server_id, channel_id, message_id=message_id)

    async def unpin_message(self, server_id: str, channel_id: str, message_id: str) -> Dict[str, Any]:
        return await self._message_action("unpin_message", server_id, channel_id, message_id=message_id)

    async def delete_message(self, server_id: str, channel_id: str, message_id: str) -> Dict[str, Any]:
        return await self._message_action("delete_message", server_id, channel_id, message_id=message_id)

    async def edit_message(
        self,
        server_id: str,
        channel_id: str,
        message_id: str,
        content: str,
        attachments: Optional[List[Dict[str, Any]]] = None,
        *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await self._message_action(
            "edit_message",
            server_id,
            channel_id,
            message_id=message_id,
            content=content,
            attachments=attachments,
            embeds=embeds,
            components=components,
            allowed_mentions=allowed_mentions,
        )

    async def join_voice(
        self,
        server_id: str,
        channel_id: str,
        *,
        publish_audio: bool = True,
        status: str = "",
        event_id: str = "",
    ) -> Dict[str, Any]:
        return await self._voice_action("join", server_id, channel_id, publish_audio=publish_audio, status=status, event_id=event_id)

    async def leave_voice(self, server_id: str, channel_id: str, *, event_id: str = "") -> Dict[str, Any]:
        return await self._voice_action("leave", server_id, channel_id, event_id=event_id)

    async def set_voice_status(self, server_id: str, channel_id: str, status: str, *, event_id: str = "") -> Dict[str, Any]:
        return await self._voice_action("status", server_id, channel_id, status=status, event_id=event_id)

    async def get_voice_state(self, server_id: str, channel_id: str, *, event_id: str = "") -> Dict[str, Any]:
        return await self._voice_action("state", server_id, channel_id, event_id=event_id)

    async def heartbeat_voice(self, server_id: str, channel_id: str, connection_id: str, *, status: Optional[str] = None) -> Dict[str, Any]:
        return await self._voice_action("heartbeat", server_id, channel_id, connection_id=connection_id, status=status)

    async def close_voice_connection(self, server_id: str, channel_id: str, connection_id: str) -> Dict[str, Any]:
        return await self._voice_action("close_connection", server_id, channel_id, connection_id=connection_id)

    async def recover_voice(self, server_id: str, channel_id: str = "", *, event_id: str = "", connection_id: str = "", publish_audio: bool = True, status: str = "") -> Dict[str, Any]:
        return await self._voice_action("recover", server_id, channel_id, event_id=event_id, connection_id=connection_id, publish_audio=publish_audio, status=status)

    async def capture_voice(self, server_id: str, channel_id: str = "", *, event_id: str, recording: bool = False) -> Dict[str, Any]:
        return await self._call_function("altara-bot-audio-capture", {
            "action": "begin", "server_id": str(server_id or ""), "channel_id": str(channel_id or ""),
            "event_id": str(event_id or ""), "recording": recording is True,
        })

    async def heartbeat_capture(self, server_id: str, channel_id: str, capture_id: str) -> Dict[str, Any]:
        return await self._call_function("altara-bot-audio-capture", {"action": "heartbeat", "server_id": server_id, "channel_id": channel_id, "capture_id": capture_id})

    async def close_capture(self, server_id: str, channel_id: str, capture_id: str) -> Dict[str, Any]:
        return await self._call_function("altara-bot-audio-capture", {"action": "close", "server_id": server_id, "channel_id": channel_id, "capture_id": capture_id})

    async def heartbeat_audio_capture(self, server_id: str, channel_id: str, capture_id: str) -> Dict[str, Any]:
        return await self.heartbeat_capture(server_id, channel_id, capture_id)

    async def close_audio_capture(self, server_id: str, channel_id: str, capture_id: str) -> Dict[str, Any]:
        return await self.close_capture(server_id, channel_id, capture_id)

    async def upload_attachment(self, server_id: str, channel_id: str, file: Any = None, *, file_path: Any = None, file_name: Optional[str] = None, mime: Optional[str] = None) -> Dict[str, Any]:
        if file_path is not None:
            if file is not None:
                raise ValueError("invalid_attachment")
            path = os.fspath(file_path)
            file = await asyncio.to_thread(_read_attachment_path, path)
            if file_name is None:
                file_name = os.fsdecode(path)
        elif hasattr(file, "read"):
            if file_name is None:
                file_name = getattr(file, "name", None)
            file = await asyncio.to_thread(file.read, MAX_ATTACHMENT_BYTES + 1)
        if not isinstance(file, (bytes, bytearray, memoryview)):
            raise ValueError("invalid_attachment")
        size = file.nbytes if isinstance(file, memoryview) else len(file)
        if not 0 < size <= MAX_ATTACHMENT_BYTES:
            raise ValueError("invalid_attachment")
        name = re.split(r"[\\/]", str(file_name or "attachment"))[-1]
        if not name or len(name) > 255 or re.search(r"[\x00-\x1f\x7f]", name):
            raise ValueError("invalid_attachment_name")
        content_type = mime or ATTACHMENT_MIME_TYPES.get(name.rsplit(".", 1)[-1].lower(), "application/octet-stream")
        if not isinstance(content_type, str) or not re.fullmatch(r"[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+", content_type):
            raise ValueError("invalid_attachment_mime")
        result = await self._call_function(
            "altara-bot-attachments", {"server_id": str(server_id or ""), "channel_id": str(channel_id or "")},
            files={"file": (name, bytes(file), content_type)},
        )
        if not isinstance(result.get("attachment"), dict):
            raise AltaraAPIError("invalid_attachment_response")
        return result["attachment"]

    async def upload_direct_message_attachment(self, server_id: str, user_id: str, file: Any = None, *, file_path: Any = None, file_name: Optional[str] = None, mime: Optional[str] = None) -> Dict[str, Any]:
        if file_path is not None:
            if file is not None:
                raise ValueError("invalid_attachment")
            path = os.fspath(file_path)
            file = await asyncio.to_thread(_read_attachment_path, path)
            if file_name is None:
                file_name = os.fsdecode(path)
        elif hasattr(file, "read"):
            if file_name is None:
                file_name = getattr(file, "name", None)
            file = await asyncio.to_thread(file.read, MAX_ATTACHMENT_BYTES + 1)
        if not isinstance(file, (bytes, bytearray, memoryview)):
            raise ValueError("invalid_attachment")
        size = file.nbytes if isinstance(file, memoryview) else len(file)
        if not 0 < size <= MAX_ATTACHMENT_BYTES:
            raise ValueError("invalid_attachment")
        name = re.split(r"[\\/]", str(file_name or "attachment"))[-1]
        if not name or len(name) > 255 or re.search(r"[\x00-\x1f\x7f]", name):
            raise ValueError("invalid_attachment_name")
        content_type = mime or ATTACHMENT_MIME_TYPES.get(name.rsplit(".", 1)[-1].lower(), "application/octet-stream")
        if not isinstance(content_type, str) or not re.fullmatch(r"[a-zA-Z0-9!#$&^_.+-]+/[a-zA-Z0-9!#$&^_.+-]+", content_type):
            raise ValueError("invalid_attachment_mime")
        result = await self._call_function("altara-bot-dm-attachments", {"server_id": str(server_id or ""), "user_id": str(user_id or "")},
            files={"file": (name, bytes(file), content_type)})
        if not isinstance(result.get("attachment"), dict):
            raise AltaraAPIError("invalid_attachment_response")
        return result["attachment"]

    async def get_direct_message_attachment(self, message_id: str, upload_id: str, *, download: bool = False) -> Dict[str, Any]:
        return await self._call_function("altara-bot-dm-attachments", {"action": "read", "message_id": message_id, "upload_id": upload_id, "download": download is True})

    async def admin_action(self, action: str, server_id: str, payload: Optional[Dict[str, Any]] = None, *, request_id: Optional[str] = None, **fields) -> Dict[str, Any]:
        return await self._platform_action("altara-bot-admin", action, server_id, payload, request_id, fields)

    async def surface_action(self, action: str, server_id: str, payload: Optional[Dict[str, Any]] = None, *, request_id: Optional[str] = None, **fields) -> Dict[str, Any]:
        if type(action) is not str:
            raise ValueError("invalid_surface_action")
        release_action = action.strip().lower()
        if payload is not None and not isinstance(payload, dict):
            raise ValueError("invalid_action_payload")
        # Check the same plain snapshot that will be serialized, including field precedence.
        effective_payload = {**(payload or {}), **fields}
        mode = effective_payload.get("mode")
        if release_action == "channel_mode_set":
            if type(mode) is not str:
                raise ValueError("invalid_channel_mode")
        if not STAGE_RELEASE_ENABLED and (release_action.startswith("stage_") or
                (release_action == "channel_mode_set" and mode.strip().lower() == "stage")):
            raise ValueError("stage_feature_disabled")
        if release_action in ("poll_create", "poll_read", "poll_close"):
            channel_id = effective_payload.pop("channel_id", None)
            request_id = str(uuid.uuid4()) if request_id is None else request_id
            if not _event_uuid(request_id):
                raise ValueError("invalid_request_id")
            return await self._call_function("altara-bot-surfaces", {
                "action": action, "server_id": server_id, "channel_id": channel_id,
                "request_id": request_id, "payload": effective_payload,
            })
        return await self._platform_action("altara-bot-surfaces", action, server_id, effective_payload, request_id, {})

    async def _platform_action(self, endpoint, action, server_id, payload, request_id, fields):
        if payload is not None and not isinstance(payload, dict):
            raise ValueError("invalid_action_payload")
        request_id = str(uuid.uuid4()) if request_id is None else request_id
        if not _event_uuid(request_id):
            raise ValueError("invalid_request_id")
        return await self._call_function(endpoint, {
            "action": action, "server_id": server_id, "request_id": request_id,
            "payload": {**(payload or {}), **fields},
        })

    async def create_role(self, server_id: str, **options):
        return await self.admin_action("role_create", server_id, **options)

    async def update_role(self, server_id: str, **options):
        return await self.admin_action("role_update", server_id, **options)

    async def delete_role(self, server_id: str, **options):
        return await self.admin_action("role_delete", server_id, **options)

    async def add_member_role(self, server_id: str, **options):
        return await self.admin_action("member_role_add", server_id, **options)

    async def remove_member_role(self, server_id: str, **options):
        return await self.admin_action("member_role_remove", server_id, **options)

    async def kick_member(self, server_id: str, **options):
        return await self.admin_action("member_kick", server_id, **options)

    async def ban_member(self, server_id: str, **options):
        return await self.admin_action("member_ban", server_id, **options)

    async def unban_member(self, server_id: str, **options):
        return await self.admin_action("member_unban", server_id, **options)

    async def timeout_member(self, server_id: str, **options):
        return await self.admin_action("member_timeout", server_id, **options)

    async def clear_member_timeout(self, server_id: str, **options):
        return await self.admin_action("member_timeout_clear", server_id, **options)

    async def create_channel(self, server_id: str, **options):
        return await self.admin_action("channel_create", server_id, **options)

    async def update_channel(self, server_id: str, **options):
        return await self.admin_action("channel_update", server_id, **options)

    async def delete_channel(self, server_id: str, **options):
        return await self.admin_action("channel_delete", server_id, **options)

    async def update_server(self, server_id: str, **options):
        return await self.admin_action("server_update", server_id, **options)

    async def delete_member_message(self, server_id: str, **options):
        return await self.admin_action("message_delete", server_id, **options)

    async def create_server_event(self, server_id: str, **options):
        return await self.admin_action("event_create", server_id, **options)

    async def update_server_event(self, server_id: str, **options):
        return await self.admin_action("event_update", server_id, **options)

    async def delete_server_event(self, server_id: str, **options):
        return await self.admin_action("event_delete", server_id, **options)

    async def list_channel_permissions(self, server_id: str, **options):
        return await self.admin_action("channel_permissions_list", server_id, **options)

    async def set_channel_permissions(self, server_id: str, **options):
        return await self.admin_action("channel_permissions_set", server_id, **options)

    async def delete_channel_permissions(self, server_id: str, **options):
        return await self.admin_action("channel_permissions_delete", server_id, **options)

    async def update_server_profile(self, server_id: str, **options):
        return await self.admin_action("server_profile_update", server_id, **options)

    async def read_audit_log(self, server_id: str, **options):
        return await self.admin_action("audit_log_list", server_id, **options)

    async def list_server_event_attendees(self, server_id: str, **options):
        return await self.admin_action("event_attendees_list", server_id, **options)

    async def create_poll(self, server_id: str, **options):
        return await self.surface_action("poll_create", server_id, **options)

    async def read_poll(self, server_id: str, **options):
        return await self.surface_action("poll_read", server_id, **options)

    async def close_poll(self, server_id: str, **options):
        return await self.surface_action("poll_close", server_id, **options)

    async def list_automod_rules(self, server_id: str, **options):
        return await self.surface_action("automod_list", server_id, **options)

    async def create_automod_rule(self, server_id: str, **options):
        return await self.surface_action("automod_create", server_id, **options)

    async def update_automod_rule(self, server_id: str, **options):
        return await self.surface_action("automod_update", server_id, **options)

    async def delete_automod_rule(self, server_id: str, **options):
        return await self.surface_action("automod_delete", server_id, **options)

    async def list_expressions(self, server_id: str, **options):
        return await self.surface_action("expression_list", server_id, **options)

    async def create_expression(self, server_id: str, **options):
        return await self.surface_action("expression_create", server_id, **options)

    async def update_expression(self, server_id: str, **options):
        return await self.surface_action("expression_update", server_id, **options)

    async def delete_expression(self, server_id: str, **options):
        return await self.surface_action("expression_delete", server_id, **options)

    async def get_channel_mode(self, server_id: str, **options):
        return await self.surface_action("channel_mode_get", server_id, **options)

    async def set_channel_mode(self, server_id: str, **options):
        return await self.surface_action("channel_mode_set", server_id, **options)

    async def create_forum_post(self, server_id: str, **options):
        return await self.surface_action("forum_post_create", server_id, **options)

    async def list_forum_posts(self, server_id: str, **options):
        return await self.surface_action("forum_post_list", server_id, **options)

    async def get_stage_state(self, server_id: str, **options):
        return await self.surface_action("stage_state", server_id, **options)

    async def set_stage_participant(self, server_id: str, **options):
        return await self.surface_action("stage_participant_set", server_id, **options)

    async def request_stage_speak(self, server_id: str, **options):
        return await self.surface_action("stage_request", server_id, **options)

    async def get_server_event_status(self, server_id: str, **options):
        return await self.surface_action("event_status_get", server_id, **options)

    async def update_server_event_status(self, server_id: str, **options):
        return await self.surface_action("event_status_update", server_id, **options)

    async def set_server_event_response(self, server_id: str, **options):
        return await self.surface_action("event_rsvp", server_id, **options)

    async def list_server_event_bots(self, server_id: str, **options):
        return await self.surface_action("event_bot_attendees", server_id, **options)

    async def upload_expression(self, server_id: str, kind: str, file=None, *, file_path=None, mime="image/png", request_id=None):
        if file_path is not None:
            if file is not None:
                raise ValueError("invalid_expression_image")
            file = await asyncio.to_thread(_read_attachment_path, os.fspath(file_path))
        if not isinstance(file, (bytes, bytearray, memoryview)):
            raise ValueError("invalid_expression_image")
        size = file.nbytes if isinstance(file, memoryview) else len(file)
        if not 0 < size <= 512 * 1024:
            raise ValueError("invalid_expression_image")
        request_id = request_id or str(uuid.uuid4())
        if not _event_uuid(server_id) or not _event_uuid(request_id) or kind not in ("emoji", "sticker") or mime not in ("image/png", "image/jpeg", "image/gif", "image/webp"):
            raise ValueError("invalid_expression_image")
        return await self._call_function("altara-server-expression-media", {}, raw=bytes(file), content_type=mime,
                                         expression={"server": server_id, "request": request_id, "kind": kind})

    async def send_direct_message(self, server_id: str, user_id: str, content: str = "", *, request_id: Optional[str] = None, embeds=None, components=None, reply_to_id: Optional[str] = None, attachments=None):
        action = "dm_message_send" if reply_to_id is not None or attachments is not None else "dm_send"
        return await self.surface_action(action, server_id, request_id=request_id, user_id=user_id, content=str(content or ""),
                                         **({"embeds": embeds} if embeds is not None else {}), **({"components": components} if components is not None else {}),
                                         **({"reply_to_id": reply_to_id} if reply_to_id is not None else {}),
                                         **({"attachments": attachments} if attachments is not None else {}))

    async def read_direct_messages(self, server_id: str, user_id: str, *, limit: int = 25, request_id: Optional[str] = None):
        return await self.surface_action("dm_history", server_id, user_id=user_id, limit=limit, request_id=request_id)

    async def read_direct_message_history(self, server_id: str, user_id: str, *, before: Optional[Dict[str, str]] = None, request_id: Optional[str] = None):
        return await self.surface_action("dm_message_history", server_id, user_id=user_id, request_id=request_id,
                                         **({"before": before} if before is not None else {}))

    async def edit_direct_message(self, server_id: str, user_id: str, message_id: str, content: Optional[str] = None, *, request_id: Optional[str] = None, embeds=None, attachments=None):
        return await self.surface_action("dm_edit", server_id, user_id=user_id, message_id=message_id, request_id=request_id,
                                         **({"content": str(content)} if content is not None else {}),
                                         **({"embeds": embeds} if embeds is not None else {}),
                                         **({"attachments": attachments} if attachments is not None else {}))

    async def delete_direct_message(self, server_id: str, user_id: str, message_id: str, *, request_id: Optional[str] = None):
        return await self.surface_action("dm_delete", server_id, user_id=user_id, message_id=message_id, request_id=request_id)

    async def set_direct_message_reaction(self, server_id: str, user_id: str, message_id: str, emoji: str, enabled: bool, *, request_id: Optional[str] = None):
        return await self.surface_action("dm_reaction", server_id, user_id=user_id, message_id=message_id, emoji=emoji, enabled=enabled, request_id=request_id)

    async def set_direct_message_pinned(self, server_id: str, user_id: str, message_id: str, enabled: bool, *, request_id: Optional[str] = None):
        return await self.surface_action("dm_pin", server_id, user_id=user_id, message_id=message_id, enabled=enabled, request_id=request_id)

    async def read_direct_message_pins(self, server_id: str, user_id: str, *, request_id: Optional[str] = None):
        return await self.surface_action("dm_message_pins", server_id, user_id=user_id, request_id=request_id)

    async def create_thread(self, server_id: str, **options):
        return await self.surface_action("thread_create", server_id, **options)

    async def list_threads(self, server_id: str, **options):
        return await self.surface_action("thread_list", server_id, **options)

    async def read_thread(self, server_id: str, **options):
        return await self.surface_action("thread_history", server_id, **options)

    async def send_thread_message(self, server_id: str, **options):
        return await self.surface_action("thread_send", server_id, **options)

    async def archive_thread(self, server_id: str, **options):
        return await self.surface_action("thread_archive", server_id, **options)

    async def list_webhooks(self, server_id: str, **options):
        return await self.surface_action("webhook_list", server_id, **options)

    async def revoke_webhook(self, server_id: str, **options):
        return await self.surface_action("webhook_revoke", server_id, **options)

    async def create_webhook(self, server_id: str, **options):
        secret = secrets.token_hex(32)
        options["token_hash"] = hashlib.sha256(secret.encode("ascii")).hexdigest()
        result = await self.surface_action("webhook_create", server_id, **options)
        webhook_id = _as_dict(result.get("webhook")).get("id")
        if not _event_uuid(webhook_id):
            raise AltaraAPIError("invalid_webhook_response")
        return {**result, "token": f"{webhook_id}:{secret}", "url": f"{self.functions_url}/altara-bot-webhook"}

    async def execute_webhook(self, token: str, content: str = "", *, embeds=None, components=None):
        parts = token.split(":") if isinstance(token, str) else []
        if len(parts) != 2 or not _event_uuid(parts[0]) or re.fullmatch(r"[a-f0-9]{64}", parts[1], re.IGNORECASE) is None:
            raise ValueError("invalid_webhook")
        return await self._call_function("altara-bot-webhook", {
            "content": str(content or ""), "embeds": [] if embeds is None else embeds, "components": [] if components is None else components,
        }, authorization=f"AltaraWebhook {token}")

    async def _message_action(
        self,
        action: str,
        server_id: str,
        channel_id: str,
        *,
        message_id: str = "",
        content: str = "",
        attachments: Optional[List[Dict[str, Any]]] = None,
        emoji: str = "",
        limit: int = 25,
        embeds: Optional[List[Dict[str, Any]]] = None,
        components: Optional[List[Dict[str, Any]]] = None,
        allowed_mentions: Optional[Dict[str, Any]] = None,
        enabled: Optional[bool] = None,
    ) -> Dict[str, Any]:
        return await self._call_function("altara-bot-message-send", {
            "action": action,
            "server_id": str(server_id or ""),
            "channel_id": str(channel_id or ""),
            "message_id": str(message_id or ""),
            "content": str(content or "")[:2000],
            "attachments": attachments if isinstance(attachments, list) else [],
            **({"preserve_attachments": True} if action == "edit_message" and attachments is None else {}),
            **({"allowed_mentions": _normalize_allowed_mentions(allowed_mentions)} if allowed_mentions is not None else {}),
            **({"embeds": embeds} if embeds is not None else {}),
            **({"components": components} if components is not None else {}),
            "emoji": str(emoji or ""),
            **({"enabled": enabled} if action == "set_reaction" else {}),
            "limit": int(limit or 25),
        })

    async def _voice_action(
        self,
        action: str,
        server_id: str,
        channel_id: str,
        *,
        publish_audio: bool = True,
        status: Optional[str] = "",
        event_id: str = "",
        connection_id: str = "",
    ) -> Dict[str, Any]:
        return await self._call_function("altara-bot-voice-token", {
            "action": action,
            "event_id": str(event_id or ""),
            "server_id": str(server_id or ""),
            "channel_id": str(channel_id or ""),
            "publish_audio": publish_audio is not False,
            **({"status": str(status or "")[:80]} if action != "heartbeat" or status is not None else {}),
            **({"connection_id": str(connection_id)} if connection_id else {}),
        })

    async def _dispatch_event(self, event: Dict[str, Any]) -> None:
        if event.get('type') == 'APPLICATION_COMMAND_AUTOCOMPLETE':
            ctx = AutocompleteContext(self, event)
            handler = self._autocomplete_handlers.get(ctx.command_name)
            try:
                if handler:
                    result = handler(ctx)
                    if inspect.isawaitable(result):
                        await result
                if not ctx.replied and not ctx.response_attempted:
                    await ctx.respond([])
            except Exception as error:
                await self._emit_observers('error', error)
                # Autocomplete failures are never sent as public messages.
                if not ctx.replied and not ctx.response_attempted:
                    try:
                        await ctx.respond([])
                    except Exception as reply_error:
                        await self._emit_observers('error', reply_error)
            return
        if event.get("type") and event["type"] != "APPLICATION_COMMAND":
            return
        ctx = CommandContext(self, event)
        name = ctx.command_name
        handler = self._handlers.get(_command_key(name, ctx.command_type)) if name else None
        if not handler:
            await ctx.reply(f"Unknown command: /{name or 'unknown'}")
            return

        try:
            result = handler(ctx)
            if inspect.isawaitable(result):
                await result
        except Exception as error:
            print(f"[altara] command failed: {error}")
            try:
                if not ctx.replied and not ctx.private_response_attempted:
                    await ctx.reply("Command failed.")
            except Exception as reply_error:
                print(f"[altara] reply failed: {reply_error}")

    async def _call_function(self, name: str, body: Dict[str, Any], *, files=None, authorization: Optional[str] = None, raw=None, content_type=None, expression=None) -> Dict[str, Any]:
        if not self._client:
            raise RuntimeError("AltaraClient is not running")
        endpoint = f"{self.functions_url}/{name}"
        print(f"[altara] POST {endpoint}")
        headers = {"Authorization": authorization or f"Bot {self.token}", "User-Agent": "ALTARA-Python-Bot-Example/0.1"}
        if raw is not None:
            headers["Content-Type"] = content_type
            if expression is not None:
                headers.update({"x-altara-server-id": expression["server"], "x-altara-request-id": expression["request"], "x-altara-expression-kind": expression["kind"]})
            response = await self._client.post(endpoint, headers=headers, content=raw)
        elif files is None:
            headers["Content-Type"] = "application/json"
            response = await self._client.post(endpoint, headers=headers, json=body or {})
        else:
            response = await self._client.post(endpoint, headers=headers, data=body or {}, files=files)
        try:
            data = response.json() if response.text.strip() else {}
        except ValueError:
            data = {"error": "invalid_json_response"}

        if not isinstance(data, dict):
            raise AltaraAPIError("invalid_json_response", response.status_code)
        if response.status_code < 200 or response.status_code >= 300 or data.get("ok") is False:
            raise AltaraAPIError(str(data.get("error") or f"HTTP {response.status_code}"), response.status_code, data)

        if data.get("error") == "invalid_json_response":
            raise AltaraAPIError("invalid_json_response", response.status_code)

        return data


def _validate_private_reply(ephemeral, attachments, components, allowed_mentions):
    if type(ephemeral) is not bool:
        raise ValueError("invalid_ephemeral")
    if ephemeral and (attachments not in (None, []) or components is not None or allowed_mentions is not None):
        raise ValueError("private_response_unsupported")


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _normalize_server_settings_features(features):
    if not isinstance(features, (list, tuple)) or any(feature not in ("welcome_messages", "dm_commands") for feature in features):
        raise ValueError("invalid_server_settings_features")
    return sorted(set(features))


def _settings_revision(value):
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 9007199254740991


def _validate_server_settings(data, server):
    settings = _as_dict(data.get("settings"))
    try:
        features = _normalize_server_settings_features(data.get("features"))
    except ValueError:
        raise ValueError("invalid_server_settings_response") from None
    if (data.get("ok") is not True or data.get("server_id") != server or not _event_uuid(data.get("bot_id")) or
            not _event_uuid(data.get("install_id")) or not isinstance(data.get("configured"), bool) or
            not _settings_revision(data.get("revision")) or not _settings_revision(data.get("support_revision")) or
            not isinstance(settings.get("welcome_enabled"), bool) or not isinstance(settings.get("dm_commands_enabled"), bool) or
            not (settings.get("welcome_channel_id") is None or _event_uuid(settings.get("welcome_channel_id"))) or
            "welcome_channel_id" not in settings or
            (settings["welcome_enabled"] and (not settings["welcome_channel_id"] or "welcome_messages" not in features)) or
            (settings["dm_commands_enabled"] and "dm_commands" not in features)):
        raise ValueError("invalid_server_settings_response")
    return data


def _normalize_allowed_mentions(value):
    if not isinstance(value, dict) or any(key != "users" for key in value):
        raise ValueError("invalid_allowed_mentions")
    users = value.get("users", [])
    if not isinstance(users, list) or len(users) > 10 or any(not _event_uuid(user) for user in users):
        raise ValueError("invalid_allowed_mentions")
    if len({user.lower() for user in users}) != len(users):
        raise ValueError("invalid_allowed_mentions")
    return {"users": list(users)} if "users" in value else {}


def _read_attachment_path(path):
    try:
        initial = os.stat(path)
        if not stat.S_ISREG(initial.st_mode) or not 0 < initial.st_size <= MAX_ATTACHMENT_BYTES:
            raise ValueError("invalid_attachment")
        with open(path, "rb") as file:
            info = os.fstat(file.fileno())
            if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= MAX_ATTACHMENT_BYTES:
                raise ValueError("invalid_attachment")
            # Bound the read too: a file can grow after the size check.
            return file.read(MAX_ATTACHMENT_BYTES + 1)
    except OSError as error:
        raise ValueError("attachment_read_failed") from error


def _event_uuid(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", value, re.IGNORECASE) is not None


def _direct_message_actor(event):
    actor = _as_dict(event.get("data")).get("actor")
    if actor is None:
        return None
    if not isinstance(actor, dict) or not isinstance(actor.get("type"), str) or actor.get("type") not in {"user", "bot"} or not _event_uuid(actor.get("id")):
        raise ValueError("invalid_direct_message_event")
    expected = _as_dict(event.get("user")).get("id") if actor["type"] == "user" else event.get("bot_id")
    if not _event_uuid(expected) or actor["id"].lower() != expected.lower():
        raise ValueError("invalid_direct_message_event")
    return {"type": actor["type"], "id": actor["id"]}


def _validate_direct_message_event(event):
    if not isinstance(event, dict) or not isinstance(event.get("type"), str) or event["type"] not in DIRECT_MESSAGE_EVENT_HANDLERS \
            or not isinstance(event.get("user"), dict) or (event.get("data") is not None and not isinstance(event["data"], dict)) \
            or not all(_event_uuid(event.get(key)) for key in ("id", "lease_id", "server_id")) \
            or not _event_uuid(event["user"].get("id")) or event.get("channel_id") not in (None, ""):
        raise ValueError("invalid_direct_message_event")
    message_id = _as_dict(event.get("data")).get("message_id")
    if event["type"] != "DIRECT_MESSAGE_CREATE" and (not _event_uuid(message_id) or event["id"].lower() == message_id.lower()):
        raise ValueError("invalid_direct_message_event")
    _direct_message_actor(event)


def _terminal_connection_error(error: Exception) -> bool:
    return isinstance(error, AltaraAPIError) and (
        error.status_code == 401
        or error.details.get("error") in {"bot_not_active", "bot_token_revoked", "no_matching_bot_token"}
    )


def _retry_delay(error: Exception, failures: int, interval: float) -> float:
    delay = min(interval * (2 ** min(failures, 5)), 30.0)
    if isinstance(error, AltaraAPIError):
        try:
            retry_after = float(error.details.get("retry_after_seconds") or 0)
            if retry_after > 0:
                delay = max(delay, min(retry_after, 300.0))
        except (TypeError, ValueError):
            pass
    return delay


_COMMAND_TYPES = {1: 'CHAT_INPUT', 2: 'USER', 3: 'MESSAGE'}
_OPTION_TYPES = {1:'SUB_COMMAND',2:'SUB_COMMAND_GROUP',3:'STRING',4:'INTEGER',5:'BOOLEAN',6:'USER',7:'CHANNEL',8:'ROLE',9:'MENTIONABLE',10:'NUMBER',11:'ATTACHMENT'}
_CHOICE_TYPES = {'STRING', 'INTEGER', 'NUMBER'}
_BRANCH_TYPES = {'SUB_COMMAND', 'SUB_COMMAND_GROUP'}


def _allowed_command_keys(value, keys, error):
    if any(key not in keys for key in value):
        raise ValueError(error)


def _normalize_command_type(value='CHAT_INPUT'):
    normalized = _COMMAND_TYPES.get(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else str(value).strip().upper()
    if normalized not in {'CHAT_INPUT', 'USER', 'MESSAGE'}:
        raise ValueError('invalid_command_type')
    return normalized


def _normalize_command_name(value, type='CHAT_INPUT'):
    type = _normalize_command_type(type)
    raw = str(value if value is not None else '').strip()
    if type != 'CHAT_INPUT':
        return raw if raw and len(raw) <= 32 and not re.search(r'[\x00-\x1f\x7f]', raw) else ''
    raw = raw.lower().removeprefix('/')
    return raw if re.fullmatch(r'[a-z0-9_-]{1,32}', raw) else ''


def _command_key(name, type='CHAT_INPUT'):
    type = _normalize_command_type(type)
    name = _normalize_command_name(name, type)
    if not name:
        raise ValueError('invalid_command_name')
    return name if type == 'CHAT_INPUT' else f'{type}:{name.lower()}'


def _normalize_description(value):
    return ' '.join(str(value if value is not None else '').split()).strip()[:120]


def _normalize_option_type(value='STRING'):
    normalized = _OPTION_TYPES.get(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else str(value).strip().upper()
    if normalized not in set(_OPTION_TYPES.values()):
        raise ValueError('invalid_command_option_type')
    return normalized


def _valid_command_number(value, integer=False):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and abs(value) <= 9007199254740991 and math.isfinite(value) and (not integer or value == int(value))


def _normalize_choices(value, option_type='STRING'):
    type = _normalize_option_type(option_type)
    if type not in _CHOICE_TYPES or not isinstance(value, list) or len(value) > 25:
        raise ValueError('invalid_command_choices')
    choices = []
    for item in value:
        if not isinstance(item, dict):
            raise ValueError('invalid_command_choice')
        _allowed_command_keys(item, {'name','label','value'}, 'unsupported_command_choice_field')
        label = next((item[key] for key in ('name', 'label', 'value') if item.get(key) is not None), None)
        name = ' '.join(str(label if label is not None else '').split()).strip()[:80]
        selected = item.get('value') if item.get('value') is not None else item.get('name')
        if not name:
            raise ValueError('invalid_command_choice_name')
        if type == 'STRING':
            if not isinstance(selected, str) or not selected or len(selected) > 100:
                raise ValueError('invalid_command_choice_value')
        elif not _valid_command_number(selected, type == 'INTEGER'):
            raise ValueError('invalid_command_choice_value')
        choices.append({'name': name, 'value': selected})
    return choices


def _normalize_command_options(value=None, parent_type='', depth=0):
    if value is None:
        value = []
    if not isinstance(value, list) or len(value) > 25 or depth > 2:
        raise ValueError('invalid_command_options')
    normalized, seen, mode, optional_seen = [], set(), '', False
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise ValueError(f'invalid_command_option_{index+1}')
        _allowed_command_keys(item, {'name','description','type','option_type','required','choices','options','autocomplete','min_value','max_value','min_length','max_length','channel_types'}, 'unsupported_command_option_field')
        name = _normalize_command_name(item.get('name'))
        if not name or name in seen:
            raise ValueError('invalid_or_duplicate_command_option_name')
        seen.add(name)
        if 'type' in item and 'option_type' in item and _normalize_option_type(item['type']) != _normalize_option_type(item['option_type']):
            raise ValueError('conflicting_command_option_type')
        type = _normalize_option_type(item.get('type', item.get('option_type', 'STRING')))
        branch = type in _BRANCH_TYPES
        next_mode = 'branch' if branch else 'leaf'
        if mode and mode != next_mode:
            raise ValueError('mixed_command_option_types')
        mode = next_mode
        if (parent_type == 'SUB_COMMAND_GROUP' and type != 'SUB_COMMAND') or (parent_type == 'SUB_COMMAND' and branch) or (type == 'SUB_COMMAND_GROUP' and depth != 0):
            raise ValueError('invalid_subcommand_nesting')
        option = {'name': name, 'description': _normalize_description(item.get('description') or f'{name} option'), 'type': type}
        if branch:
            _allowed_command_keys(item, {'name','description','type','option_type','options'}, 'invalid_subcommand_field')
            option['options'] = _normalize_command_options(item.get('options'), type, depth+1)
            if type == 'SUB_COMMAND_GROUP' and not option['options']:
                raise ValueError('empty_subcommand_group')
            normalized.append(option)
            continue
        if 'options' in item:
            raise ValueError('invalid_leaf_options')
        if 'required' in item and not isinstance(item['required'], bool):
            raise ValueError('invalid_command_option_required')
        option['required'] = item.get('required') is True
        if option['required'] and optional_seen:
            raise ValueError('required_options_must_come_first')
        optional_seen = optional_seen or not option['required']
        if 'autocomplete' in item:
            if not isinstance(item['autocomplete'], bool) or type not in _CHOICE_TYPES:
                raise ValueError('invalid_command_autocomplete')
            option['autocomplete'] = item['autocomplete']
        if 'choices' in item:
            choices = _normalize_choices(item['choices'], type)
            if item.get('autocomplete') is True and choices:
                raise ValueError('choices_and_autocomplete_conflict')
            if choices:
                option['choices'] = choices
        for key in ('min_value', 'max_value'):
            if key in item:
                if type not in {'INTEGER','NUMBER'} or not _valid_command_number(item[key], type == 'INTEGER'):
                    raise ValueError('invalid_command_value_bound')
                option[key] = item[key]
        if 'min_value' in option and 'max_value' in option and option['min_value'] > option['max_value']:
            raise ValueError('invalid_command_value_bounds')
        for key in ('min_length', 'max_length'):
            if key in item:
                if type != 'STRING' or not isinstance(item[key], (int, float)) or isinstance(item[key], bool) or not math.isfinite(item[key]) or item[key] != int(item[key]) or item[key] < 0 or item[key] > 6000:
                    raise ValueError('invalid_command_length_bound')
                option[key] = item[key]
        if 'min_length' in option and 'max_length' in option and option['min_length'] > option['max_length']:
            raise ValueError('invalid_command_length_bounds')
        if 'channel_types' in item:
            types = item['channel_types']
            if type != 'CHANNEL' or not isinstance(types, list) or not types or any(isinstance(kind, bool) or not isinstance(kind, (int,float)) or kind not in {0,2} for kind in types) or len(set(types)) != len(types):
                raise ValueError('invalid_command_channel_types')
            option['channel_types'] = list(types)
        normalized.append(option)
    return normalized


def _normalize_command_definition(name, metadata=None):
    metadata = {} if metadata is None else metadata
    if not isinstance(metadata, dict):
        raise ValueError('invalid_command_metadata')
    _allowed_command_keys(metadata, {'name','type','description','options'}, 'unsupported_command_field')
    type = _normalize_command_type(metadata.get('type', 'CHAT_INPUT'))
    name = _normalize_command_name(name, type)
    if not name:
        raise ValueError('invalid_command_name')
    if type != 'CHAT_INPUT':
        if ('description' in metadata and metadata['description'] != '') or ('options' in metadata and (not isinstance(metadata['options'], list) or metadata['options'])):
            raise ValueError('invalid_context_command_fields')
        return {'type': type, 'name': name, 'description': '', 'options': []}
    return {'type': type, 'name': name, 'description': _normalize_description(metadata.get('description') or f'Runs /{name}'), 'options': _normalize_command_options(metadata.get('options'))}


def _resolve_selected_command_path(value=None):
    value = [] if value is None else value
    if not isinstance(value, list) or len(value) > 25:
        raise ValueError('invalid_command_invocation_options')
    options, group, subcommand = value, '', ''
    for depth in range(3):
        if not isinstance(options, list) or len(options) > 25:
            raise ValueError('invalid_command_invocation_options')
        branches = [item for item in options if isinstance(item, dict) and _normalize_option_type(item.get('type', 'STRING')) in _BRANCH_TYPES]
        if not branches:
            break
        if len(options) != 1 or not _normalize_command_name(branches[0].get('name')):
            raise ValueError('invalid_command_invocation_path')
        branch = branches[0]
        type = _normalize_option_type(branch['type'])
        if type == 'SUB_COMMAND_GROUP':
            if depth != 0:
                raise ValueError('invalid_command_invocation_path')
            group = _normalize_command_name(branch['name'])
        else:
            if subcommand or (depth and not group):
                raise ValueError('invalid_command_invocation_path')
            subcommand = _normalize_command_name(branch['name'])
        options = branch.get('options', [])
    if group and not subcommand:
        raise ValueError('invalid_command_invocation_path')
    seen, focused = set(), None
    for item in options:
        if not isinstance(item, dict) or not _normalize_command_name(item.get('name')) or 'options' in item or _normalize_option_type(item.get('type','STRING')) in _BRANCH_TYPES or _normalize_command_name(item.get('name')) in seen:
            raise ValueError('invalid_command_invocation_options')
        seen.add(_normalize_command_name(item['name']))
        if 'focused' in item and not isinstance(item['focused'], bool):
            raise ValueError('invalid_autocomplete_focus')
        if item.get('focused') is True:
            if focused:
                raise ValueError('invalid_autocomplete_focus')
            focused = {'name': _normalize_command_name(item['name']), 'type': _normalize_option_type(item.get('type','STRING')), 'value': item.get('value') if item.get('value') is not None else ''}
    return {'subcommandGroup': group, 'subcommand': subcommand, 'options': options, 'focused': focused}


def _normalize_functions_url(value: Any) -> str:
    raw = str(value or "").strip().rstrip("/")
    return raw or DEFAULT_FUNCTIONS_URL


def _bot_token_prefix(value: Any) -> str:
    raw = str(value or "").strip()
    marker = "altara_bot_"
    if not raw.startswith(marker):
        return ""
    rest = raw[len(marker):]
    public_id = rest.split("_", 1)[0]
    if len(public_id) == 32 and all(char in "0123456789abcdef" for char in public_id):
        return f"{marker}{public_id}"
    return ""
