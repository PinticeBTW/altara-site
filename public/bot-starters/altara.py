import asyncio
import hashlib
import inspect
import os
import re
import secrets
import stat
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

import httpx


DEFAULT_FUNCTIONS_URL = "https://tbbgwjmmaiclkhssimhf.supabase.co/functions/v1"
EVENT_INTENTS = frozenset({"messages", "members", "message_content", "reactions", "voice_states", "direct_messages", "presence"})
DOMAIN_EVENT_HANDLERS = {
    "MESSAGE_CREATE": "message_create", "MESSAGE_UPDATE": "message_update", "MESSAGE_DELETE": "message_delete",
    "SERVER_MEMBER_ADD": "server_member_add", "SERVER_MEMBER_REMOVE": "server_member_remove", "SERVER_MEMBER_UPDATE": "server_member_update",
    "MESSAGE_REACTION_ADD": "reaction_add", "MESSAGE_REACTION_REMOVE": "reaction_remove",
    "VOICE_STATE_UPDATE": "voice_state_update", "PRESENCE_UPDATE": "presence_update",
    "THREAD_CREATE": "thread_create", "THREAD_UPDATE": "thread_update", "THREAD_MESSAGE_CREATE": "thread_message_create",
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


class CommandContext:
    def __init__(self, client: "AltaraClient", event: Dict[str, Any]):
        self.client = client
        self.event = event
        self.id = str(event.get("id") or "")
        data = _as_dict(event.get("data"))
        self.command_name = _normalize_command_name(data.get("name"))
        options = data.get("options")
        self.options = options if isinstance(options, list) else []
        self.user = _as_dict(event.get("user"))
        self.server_id = str(event.get("server_id") or "")
        self.channel_id = str(event.get("channel_id") or "")
        self.replied = False

    def option(self, name: str, default: Any = None) -> Any:
        key = _normalize_command_name(name)
        for option in self.options:
            item = _as_dict(option)
            if _normalize_command_name(item.get("name")) == key:
                return item.get("value", default)
        return default

    async def reply(self, content: str = "", attachments: Optional[List[Dict[str, Any]]] = None, *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        result = await self.client.reply(self.id, content, attachments=attachments, embeds=embeds, components=components, allowed_mentions=allowed_mentions)
        self.replied = True
        return result

    async def send_message(self, content: str = "", attachments: Optional[List[Dict[str, Any]]] = None, *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return await self.client.send_message(self.server_id, self.channel_id, content, attachments=attachments, embeds=embeds, components=components, allowed_mentions=allowed_mentions)

    async def read_message_history(self, limit: int = 25) -> List[Dict[str, Any]]:
        return await self.client.read_message_history(self.server_id, self.channel_id, limit=limit)

    async def add_reaction(self, message_id: str, emoji: str) -> Dict[str, Any]:
        return await self.client.add_reaction(self.server_id, self.channel_id, message_id, emoji)

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
        self.id = event["id"]
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

    async def send_message(self, content: str = "", channel_id: Optional[str] = None, *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if self.type in {"THREAD_CREATE", "THREAD_UPDATE", "THREAD_MESSAGE_CREATE"}:
            if channel_id is not None:
                raise ValueError("thread_channel_override_forbidden")
            return await self.reply(content, embeds=embeds, components=components, allowed_mentions=allowed_mentions)
        if self.type == "DIRECT_MESSAGE_CREATE":
            if channel_id is not None:
                raise ValueError("direct_message_channel_override_forbidden")
            return await self.reply(content, embeds=embeds, components=components, allowed_mentions=allowed_mentions)
        target = self.channel_id if channel_id is None else channel_id
        if not target:
            raise ValueError("event_channel_required")
        return await self.client.send_message(self.server_id, target, content, embeds=embeds, components=components, allowed_mentions=allowed_mentions)

    async def reply(self, content: str = "", *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if allowed_mentions is not None and self.type in {"THREAD_CREATE", "THREAD_UPDATE", "THREAD_MESSAGE_CREATE", "DIRECT_MESSAGE_CREATE"}:
            raise ValueError("private_surface_mentions_unsupported")
        if self.type in {"THREAD_CREATE", "THREAD_UPDATE", "THREAD_MESSAGE_CREATE"}:
            if not all(_event_uuid(value) for value in (self.id, self.server_id, self.channel_id, self.thread_id)):
                raise ValueError("invalid_thread_event")
            return await self.client.send_thread_message(
                self.server_id, channel_id=self.channel_id, thread_id=self.thread_id, request_id=self.id, content=str(content or ""),
                **({"embeds": embeds} if embeds is not None else {}), **({"components": components} if components is not None else {}),
            )
        if self.type == "DIRECT_MESSAGE_CREATE":
            # Replies remain bound to the private event's sender and original install.
            if not _event_uuid(self.server_id) or not _event_uuid(self.user.get("id")) or not _event_uuid(self.id):
                raise ValueError("invalid_direct_message_event")
            return await self.client.send_direct_message(
                self.server_id, self.user["id"], content, request_id=self.id, embeds=embeds, components=components,
            )
        return await self.send_message(content, embeds=embeds, components=components, allowed_mentions=allowed_mentions)



class ComponentContext(CommandContext):
    def __init__(self, client, event):
        super().__init__(client, event)
        data = _as_dict(event.get("data"))
        self.custom_id = str(data.get("custom_id") or "")
        self.values = data.get("values") if isinstance(data.get("values"), list) else []
        self.fields = _as_dict(data.get("fields"))
        self.message_id = str(event.get("message_id") or "")
        self.type = event.get("type")
        self.lease_id = event.get("lease_id")

    def is_button(self):
        return self.type == "MESSAGE_COMPONENT" and self.event.get("data", {}).get("component_type") == 2

    def is_string_select_menu(self):
        return self.type == "MESSAGE_COMPONENT" and self.event.get("data", {}).get("component_type") == 3

    def is_modal_submit(self):
        return self.type == "MODAL_SUBMIT"

    async def respond(self, response):
        result = await self.client._call_function("altara-bot-components", {"action": "respond", "event_id": self.id, "lease_id": self.lease_id, "response": response})
        self.replied = True
        return result

    async def reply(self, content="", *, embeds=None, components=None):
        response = {"action": "reply", "content": str(content or "")}
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
    ):
        self.token = str(token or os.getenv("ALTARA_BOT_TOKEN") or "").strip()
        self.functions_url = _normalize_functions_url(functions_url or os.getenv("ALTARA_FUNCTIONS_URL") or DEFAULT_FUNCTIONS_URL)
        self.token_prefix = _bot_token_prefix(self.token)
        self.poll_interval = max(float(poll_interval), 1.0)
        self.batch_size = min(max(int(batch_size), 1), 10)
        self._handlers: Dict[str, Callable[[CommandContext], Any]] = {}
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

    def on(self, name: str, handler: Callable) -> "AltaraClient":
        if name not in set(DOMAIN_EVENT_HANDLERS.values()) | {"direct_message_create", "event_overflow", "error", "interaction_create"} or not callable(handler):
            raise ValueError("invalid_event_handler")
        self._event_handlers.setdefault(name, []).append(handler)
        return self

    def event(self, name: str) -> Callable:
        def decorator(handler: Callable) -> Callable:
            self.on(name, handler)
            return handler
        return decorator

    async def _emit_domain(self, name: str, value: Any) -> None:
        for handler in self._event_handlers.get(name, []):
            result = handler(value)
            if inspect.isawaitable(result):
                await result

    def command(
        self,
        name: str,
        *,
        description: str = "",
        options: Optional[List[Dict[str, Any]]] = None,
    ) -> Callable[[Callable[[CommandContext], Any]], Callable[[CommandContext], Any]]:
        key = _normalize_command_name(name)
        if not key:
            raise ValueError("invalid_command_name")

        def decorator(handler: Callable[[CommandContext], Any]) -> Callable[[CommandContext], Any]:
            if not callable(handler):
                raise TypeError("command handler must be callable")
            self._handlers[key] = handler
            self._command_definitions[key] = {
                "name": key,
                "description": _normalize_description(description or "Bot command"),
                "options": _normalize_command_options(options or []),
            }
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

    async def poll_once(self) -> None:
        generation = self._event_generation
        data = await self._call_function("altara-bot-poll-events", {"limit": self.batch_size})
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
        if self.intents and generation == self._event_generation:
            await self.poll_domain_events()
        if self._event_handlers.get("interaction_create") and generation == self._event_generation:
            await self.poll_component_events()

    async def poll_component_events(self) -> None:
        generation = self._event_generation
        data = await self._call_function("altara-bot-components", {"action": "poll", "limit": self.batch_size})
        if generation != self._event_generation:
            return
        if data.get("ok") is not True or not isinstance(data.get("events"), list):
            raise ValueError("invalid_component_event_response")
        for event in data["events"]:
            if generation != self._event_generation:
                break
            if not _event_uuid(event.get("id")) or not _event_uuid(event.get("lease_id")) or event.get("type") not in {"MESSAGE_COMPONENT", "MODAL_SUBMIT"}:
                raise ValueError("invalid_component_event")
            ctx = ComponentContext(self, event)
            try:
                await self._emit_domain("interaction_create", ctx)
                if generation == self._event_generation and not ctx.replied:
                    await ctx.acknowledge()
            except Exception as error:
                await self._emit_domain("error", error)

    async def poll_domain_events(self) -> None:
        if self._domain_in_flight or not self.intents:
            return
        self._domain_in_flight = True
        try:
            generation = self._event_generation
            intents = [intent for intent in self.intents if intent != "direct_messages"]
            if intents:
                await self._poll_event_feed("altara-bot-events", {"intents": intents}, self._event_acks, DOMAIN_EVENT_HANDLERS, generation, False)
            if "direct_messages" in self.intents and generation == self._event_generation:
                await self.poll_direct_messages()
        finally:
            self._domain_in_flight = False

    async def poll_direct_messages(self) -> None:
        if self._dm_in_flight or "direct_messages" not in self.intents:
            return
        self._dm_in_flight = True
        try:
            await self._poll_event_feed(
                "altara-bot-surfaces", {"action": "dm_poll"}, self._dm_acks,
                {"DIRECT_MESSAGE_CREATE": "direct_message_create"}, self._event_generation, True,
            )
        finally:
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
            if not handlers.get(item.get("type")) or not _event_uuid(item.get("id")) or not _event_uuid(item.get("lease_id")):
                raise ValueError(f"invalid_{error_prefix}_event")
            if private and (not _event_uuid(item.get("server_id")) or not _event_uuid(_as_dict(item.get("user")).get("id"))):
                raise ValueError("invalid_direct_message_event")
        for ack in acks:
            if acknowledgements.get(ack["id"]) == ack:
                acknowledgements.pop(ack["id"], None)
        dropped = int(data.get("dropped_events") or 0)
        previous = self._dm_dropped_events if private else self._dropped_events
        if dropped > previous:
            await self._emit_domain("event_overflow", {"dropped_events": dropped, "source": "direct_messages" if private else "domain"})
        if private:
            self._dm_dropped_events = dropped
        else:
            self._dropped_events = dropped
        for event in events:
            if generation != self._event_generation:
                return
            now = time.monotonic()
            self._completed_events = {key: at for key, at in self._completed_events.items() if now - at <= 600}
            key = f"{endpoint}:{event['id']}"
            try:
                if key not in self._completed_events:
                    await self._emit_domain(handlers[event["type"]], EventContext(self, event))
                    if generation != self._event_generation:
                        return
                    self._completed_events[key] = now
                    while len(self._completed_events) > 1000:
                        self._completed_events.pop(next(iter(self._completed_events)))
                acknowledgements[event["id"]] = {"id": event["id"], "lease_id": event["lease_id"]}
            except Exception as error:
                print("[altara] event handler failed")
                try:
                    await self._emit_domain("error", error)
                except Exception:
                    print("[altara] error handler failed")

    async def reply(
        self,
        event_id: str,
        content: str = "",
        attachments: Optional[List[Dict[str, Any]]] = None,
        *, embeds: Optional[List[Dict[str, Any]]] = None, components: Optional[List[Dict[str, Any]]] = None, allowed_mentions: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await self._call_function("altara-bot-respond", {
            "event_id": event_id,
            "type": "CHANNEL_MESSAGE_WITH_SOURCE",
            **({"allowed_mentions": _normalize_allowed_mentions(allowed_mentions)} if allowed_mentions is not None else {}),
            "data": {
                "content": str(content or "")[:2000],
                "attachments": attachments if isinstance(attachments, list) else [],
                **({"embeds": embeds} if embeds is not None else {}),
                **({"components": components} if components is not None else {}),
            },
        })

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
        return await self._platform_action("altara-bot-surfaces", action, server_id, payload, request_id, fields)

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

    async def send_direct_message(self, server_id: str, user_id: str, content: str = "", *, request_id: Optional[str] = None, embeds=None, components=None, reply_to_id: Optional[str] = None, attachments=None):
        action = "dm_message_send" if reply_to_id is not None or attachments is not None else "dm_send"
        return await self.surface_action(action, server_id, request_id=request_id, user_id=user_id, content=str(content or ""),
                                         **({"embeds": embeds} if embeds is not None else {}), **({"components": components} if components is not None else {}),
                                         **({"reply_to_id": reply_to_id} if reply_to_id is not None else {}),
                                         **({"attachments": attachments} if attachments is not None else {}))

    async def read_direct_messages(self, server_id: str, user_id: str, *, limit: int = 25, request_id: Optional[str] = None):
        return await self.surface_action("dm_history", server_id, user_id=user_id, limit=limit, request_id=request_id)

    async def read_direct_message_history(self, server_id: str, user_id: str, *, request_id: Optional[str] = None):
        return await self.surface_action("dm_message_history", server_id, user_id=user_id, request_id=request_id)

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
        if event.get("type") and event["type"] != "APPLICATION_COMMAND":
            return
        data = _as_dict(event.get("data"))
        name = _normalize_command_name(data.get("name"))
        ctx = CommandContext(self, event)
        handler = self._handlers.get(name)
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
                if not ctx.replied:
                    await ctx.reply("Command failed.")
            except Exception as reply_error:
                print(f"[altara] reply failed: {reply_error}")

    async def _call_function(self, name: str, body: Dict[str, Any], *, files=None, authorization: Optional[str] = None) -> Dict[str, Any]:
        if not self._client:
            raise RuntimeError("AltaraClient is not running")
        endpoint = f"{self.functions_url}/{name}"
        print(f"[altara] POST {endpoint}")
        headers = {"Authorization": authorization or f"Bot {self.token}", "User-Agent": "ALTARA-Python-Bot-Example/0.1"}
        if files is None:
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


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


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


def _normalize_command_name(value: Any) -> str:
    raw = str(value or "").strip().lower().lstrip("/")
    if not raw or len(raw) > 32:
        return ""
    return raw if all(char.isalnum() or char in {"_", "-"} for char in raw) else ""


def _normalize_description(value: Any) -> str:
    text = " ".join(str(value or "").split()).strip()
    return (text[:120] if text else "Bot command")


def _normalize_command_options(value: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for index, option in enumerate(value[:25]):
        item = _as_dict(option)
        name = _normalize_command_name(item.get("name"))
        if not name:
            raise ValueError(f"invalid_command_option_name_{index + 1}")
        command_option: Dict[str, Any] = {
            "name": name,
            "description": _normalize_description(item.get("description") or f"{name} option"),
            "type": _normalize_option_type(item.get("type") or item.get("option_type")),
            "required": item.get("required") is True,
        }
        choices = item.get("choices")
        if isinstance(choices, list) and choices:
            command_option["choices"] = _normalize_choices(choices)
        normalized.append(command_option)
    return normalized


def _normalize_option_type(value: Any) -> str:
    raw = str(value or "STRING").strip().upper()
    return raw if raw in {"STRING", "INTEGER", "BOOLEAN", "NUMBER", "USER", "CHANNEL", "ROLE"} else "STRING"


def _normalize_choices(value: List[Any]) -> List[Dict[str, str]]:
    choices: List[Dict[str, str]] = []
    for choice in value[:25]:
        item = _as_dict(choice)
        name = " ".join(str(item.get("name") or item.get("label") or item.get("value") or "").split()).strip()[:80]
        raw_value = str(item.get("value") if item.get("value") is not None else item.get("name") or "")[:100]
        if name and raw_value:
            choices.append({"name": name, "value": raw_value})
    return choices


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
