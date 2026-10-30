import { validateCommunityThemePackage as validatePackage, compileCommunityThemeCss, createCommunityThemeLibrary } from './communityThemePackages.js';
import { createCommunityGlassFilter, usesCommunityGlassFilter, communityGlassCssForDocument } from './communityThemeGlass.js';
import { createThemeHomePresenter } from './themeHomePresenter.js';
import { mountVisualThemeEditor, COMMUNITY_THEME_VISUAL_STARTER, readVisualThemeOptions, updateVisualThemeCss } from './communityThemeEditor.js';
import { widgetThemePreviewCss } from './widgetAppearance.js';
import { compileCommunityThemeLayout } from './communityThemeLayout.js';

function validateCommunityThemePackage(value) {
  const pkg = validatePackage(value);
  const layout = compileCommunityThemeLayout(pkg.css);
  if (layout.error) throw new Error(layout.error);
  return pkg;
}

const MAX_IMPORT_BYTES = 1536 * 1024;
const MAX_BACKGROUND_BYTES = 512 * 1024;
const BASE_PREVIEW_CSS = `*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif;color:#f2f0ec;background:#14141c;min-height:420px}.app{display:grid;grid-template-columns:150px minmax(0,1fr) 150px;min-height:420px;gap:1px}.panel{padding:16px;background:#18181f;min-width:0}.panel.mid{padding:0}.previewBrand{font-weight:800;font-size:18px;margin:0 0 20px}.previewNav{padding:10px;border-radius:8px;margin:5px 0}.previewNav.selected{background:#34303f}.dmHeader{padding:18px;border-bottom:1px solid #33303b;font-weight:700}.dmMessages{padding:20px;min-height:255px}.dm-message{margin-bottom:22px}.dm-name{font-size:12px;font-weight:700;color:#bfa6e9}.dm-message p{margin:6px 0;line-height:1.5}.previewMuted{font-size:12px;color:#aaa6b7}.dmComposer{display:flex;gap:8px;padding:14px;border-top:1px solid #33303b}.dmInputWrap{flex:1;padding:11px;background:#101018;border:1px solid #33303b;border-radius:9px;min-width:0}.btn{border:1px solid #4a4155;border-radius:9px;padding:9px 13px;background:#2d2735;color:#f1e9f8;font:inherit}.btn.primary{background:#ccb9ee;color:#21152e}.previewAvatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#af72d8,#62a9d7);display:inline-block;vertical-align:middle;margin-right:7px}.dmHeaderActions{float:right}.panel.right p{line-height:1.5}@media(max-width:600px){.app{grid-template-columns:100px minmax(0,1fr)}.panel.right{display:none}.panel{padding:12px}.dmHeader{padding:15px}.dmMessages{padding:16px}.dmHeaderActions{display:none}}`;
// Preserve native shell nesting so author CSS can preview navigation and profile
// placement. This is static fictional markup, never a copy of the signed-in DOM.
const PREVIEW_BODY = `<div class="app" data-server-rail-flow-aware="true">
<aside class="panel left">
  <div class="leftTop">
    <div id="leftBottomVoiceStack" class="leftBottomVoiceStack">
      <div id="voiceMiniDockSlot" class="voiceMiniDockSlot" aria-live="polite"></div>
      <div id="meProfileCard" class="meRow">
        <div class="meAvatarWrap"><div id="meAvatar" class="meAvatar previewAvatar" aria-hidden="true">A</div></div>
        <div class="meText"><div id="meName" class="meName">Alex</div><div id="meTag" class="meTag">@alex</div><button id="meStatusBtn" class="statusPill" type="button" disabled><span id="meStatusLabel">Focus</span></button></div>
        <div class="meControls" role="group" aria-label="Sample quick controls"><button id="btnHeaderMicToggle" class="btn ghost meCtrlBtn" type="button" aria-label="Sample microphone" disabled><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M9 21h6"/></svg></button><button id="btnHeaderDeafenToggle" class="btn ghost meCtrlBtn" type="button" aria-label="Sample headphones" disabled><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/></svg></button><button id="btnHeaderSettings" class="btn ghost meCtrlBtn" type="button" aria-label="Sample settings" disabled><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3"/><path d="m9 3-.6 2.1-1.8 1L4.5 6l-2 3.5L4 11v2l-1.5 1.5 2 3.5 2.1-.1 1.8 1L9 21h6l.6-2.1 1.8-1 2.1.1 2-3.5L20 13v-2l1.5-1.5-2-3.5-2.1.1-1.8-1L15 3Z"/></svg></button></div>
      </div>
    </div>
    <div class="leftTabsSingle"><div class="previewBrand">ALTARA</div><button class="chip active" type="button" disabled>Friends / Messages</button></div>
    <div class="searchBox"><input id="friendSearch" class="input" aria-label="Sample friends and messages search" placeholder="Search friends and messages…" disabled></div>
  </div>
  <div class="leftList leftDock">
    <section class="leftDockGroups"><div id="leftGroupsRail" class="groupsRail"><button class="groupOrb groupOrb--app-home previewRailItem" type="button" aria-label="Sample ALTARA Home" disabled>ALT</button><button class="groupOrb previewRailItem" type="button" aria-label="Sample Atlas server" disabled>A</button><button class="groupOrb previewRailItem" type="button" aria-label="Sample Quiet Garden server" disabled>Q</button><button class="groupOrb previewRailItem" type="button" aria-label="Sample Night Lounge server" disabled>N</button></div></section>
    <section class="leftDockDms"><aside id="serverChannelsPanel" class="serverChannelsPanel hidden" aria-hidden="true" hidden></aside><div id="dmList" class="list"><div class="dmListSectionTitle">SAMPLE MESSAGES</div><button class="previewNav selected" type="button" disabled>Mika</button><button class="previewNav" type="button" disabled>Sam</button><button class="previewNav" type="button" disabled># studio</button></div></section>
    <div id="leftFriends" hidden></div>
  </div>
</aside>
<main class="panel mid"><div id="dmMain" class="dmMain"><div class="dmHeader"># general <span class="dmHeaderActions">···</span></div><div class="dmMainBody"><div class="dmThread"><div class="dmMessages"><article class="dm-message"><div class="dm-name"><span class="previewAvatar"></span>Alex</div><p>Hello! This is a theme preview.</p><div class="previewMuted">14:20</div></article><article class="dm-message"><div class="dm-name"><span class="previewAvatar"></span>Sam</div><p>A space for your own style. ✨</p><div class="previewMuted">14:21</div></article></div></div></div><div class="dmComposer"><div id="dmInputWrap" class="dmInputWrap">Message…</div><button class="btn primary" type="button" disabled>Send</button></div></div></main>
<aside class="panel right"><b>Members</b><p><span class="previewAvatar"></span>Alex</p><p><span class="previewAvatar"></span>Sam</p><p class="previewMuted">Only fictional content is shown here.</p></aside>
</div>`;
const SHELL_PREVIEW_CSS = `
.app{grid-template-columns:230px minmax(0,1fr) 150px}.panel.left{display:flex;flex-direction:column;gap:14px}
.leftTop,#leftBottomVoiceStack{display:grid;gap:12px;min-width:0}.leftList.leftDock{display:flex;gap:10px;min-width:0;flex:1}.leftDockGroups{flex:0 0 36px}.leftDockDms{flex:1;min-width:0}
#leftGroupsRail{display:flex;flex-direction:column;gap:8px}.groupOrb{display:grid;place-items:center;width:36px;min-height:36px;padding:3px;border:1px solid #4a4155;border-radius:12px;background:#28222d;color:inherit;font:inherit}
#meProfileCard{display:grid;grid-template-columns:30px minmax(0,1fr);gap:8px;align-items:center;min-width:0}.meText{min-width:0}.meName{font-weight:700}.meTag{font-size:12px;color:#aaa6b7;overflow-wrap:anywhere}.meControls{grid-column:1/-1;display:flex;gap:6px}.meCtrlBtn{display:inline-flex;align-items:center;justify-content:center;flex:0 0 28px;width:28px;height:28px;min-width:28px;min-height:28px;padding:4px}.meCtrlBtn svg{display:block;width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.statusPill{padding:2px 6px;border:1px solid #4a4155;border-radius:8px;background:#28222d;color:inherit;font:inherit;font-size:11px}.meAvatar.previewAvatar{display:grid;place-items:center;margin:0}
.previewBrand{margin-bottom:10px}.leftTabsSingle .chip{width:100%;padding:7px;border:1px solid #4a4155;border-radius:8px;background:#28222d;color:inherit;font:inherit}.searchBox .input{width:100%;min-width:0;padding:8px;border:1px solid #33303b;border-radius:8px;background:#101018;color:inherit}
#dmList{display:grid;gap:6px}.previewNav{display:flex;align-items:center;width:100%;min-width:0;margin:0;padding:8px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;overflow-wrap:anywhere}.dmListSectionTitle{font-size:10px;color:#aaa6b7}
#dmMain{display:grid;grid-template-rows:auto minmax(0,1fr) auto;flex:1;min-width:0;min-height:0}.dmMainBody{min-width:0;min-height:0;overflow:auto}.dmThread{min-width:0;min-height:0}.dmMessages{min-height:0}.dmComposer{min-width:0}
@media(max-width:600px){.app{grid-template-columns:170px minmax(0,1fr)}.panel.right{display:block;grid-column:1/-1}}
@media(max-width:400px){.app{grid-template-columns:minmax(0,1fr)}.panel.left,.panel.mid,.panel.right{grid-column:1}.leftList.leftDock{flex:none}.dmComposer{padding:12px}.dmMessages{min-height:180px}}
`;
const DASHBOARD_PREVIEW_CSS = `.app:has([data-theme-preview="dashboard"]){min-height:560px}.app:has([data-theme-preview="dashboard"]) .panel.mid{min-height:560px;overflow:auto}#tabWidgets{padding:16px;display:grid;gap:16px}.themeHomePresentation{display:grid;gap:20px}.themeHomeNavigation,.themeHomeNavigationLinks,.themeHomeStatusActions,.themeHomeServerList{display:flex;gap:10px;flex-wrap:wrap}.themeHomeNavigation{align-items:center;justify-content:space-between}.themeHomeNavigation button{font:inherit}.themeHomeHero h1{margin:12px 0;font-size:40px;font-weight:300}.themeHomeHero h1 span,.themeHomeHero h1 strong{display:block}.themeHomeDate,.themeHomeWelcome,.themeHomeServerMeta,.themeHomeActivity p{color:#b9b5bd}.themeHomeStatusButton{display:flex;gap:8px;align-items:center;padding:10px;border:1px solid #4a4155;background:#22202a;color:inherit;border-radius:14px}.themeHomeStatusButton svg{width:20px;height:20px}.themeHomeStatusCopy{display:grid;gap:4px;text-align:left}.themeHomeActivity,.themeHomeServers,.previewHomeCard{padding:16px;border:1px solid #4a4155;border-radius:16px;background:#22202a}.themeHomeActivity h2,.themeHomeSectionTitle{font-size:16px}.themeHomeServerCard{display:grid;gap:10px;flex:1;min-width:110px;text-align:left;border:1px solid #4a4155;border-radius:14px;padding:15px;background:#2b2632;color:inherit}.themeHomeServerIcon{font-size:30px}.themeHomeServerCopy{display:grid;gap:5px}.themeHomeServerCard svg{width:18px;height:18px}.leftDockGroups,#leftGroupsRail{display:grid;gap:14px}#leftGroupsRail .previewRailItem{display:grid;place-items:center;min-height:42px;border:1px solid #4a4155;border-radius:16px;background:#28222d}.previewHomeCard p{margin:8px 0;font-size:12px}`;

const COPY = {
  en: {
    browse: 'Explore themes',
    websiteError: 'Could not open the themes website. Try again.',
    transparencyHint: 'Your system is reducing transparency. Keep the system setting or explicitly choose Glass for this theme.',
    sample: 'FICTIONAL PREVIEW', sampleActivity: 'Sample activity', sampleActivityDetails: 'A space to try your theme.',
    edit: 'Edit', background: 'Background image (optional)', backgroundHint: 'PNG, JPEG or WebP, up to 512 KiB. Use theme-asset(room) in your CSS.', invalidBackground: 'Choose a PNG, JPEG or WebP image of at most 512 KiB.', backgroundReady: 'Image included in this theme. Use theme-asset(room) in your CSS.',
    title: 'Community themes', description: 'Create and import CSS themes that change ALTARA’s look and layout.', local: 'Installed on this device. Your messages stay in ALTARA.', create: 'Create theme', import: 'Import theme', example: 'Example: Liquid Glass', disable: 'Disable current theme', empty: 'No community themes installed yet.', active: 'Active', preview: 'Preview', activate: 'Activate', export: 'Export', remove: 'Remove', name: 'Name', author: 'Author', version: 'Version', about: 'Description', css: 'Theme CSS', codeHint: 'Use ALTARA’s classes and CSS variables. No JavaScript or external requests.', save: 'Save to library', cancel: 'Cancel', close: 'Close', saved: 'Theme saved to your library. Activate it when you’re ready.', activated: 'Theme activated.', disabled: 'Community theme disabled.', removed: 'Theme removed.', importTitle: 'Import a theme', importHint: 'Choose an .altara-theme.json file or paste its JSON below. Maximum 1.5 MiB.', file: 'Theme file', json: 'Theme JSON', load: 'Import to library', invalidFile: 'Choose a JSON theme file of at most 1.5 MiB.', previewHint: 'Fictional data only. This preview does not change ALTARA.', removeTitle: 'Remove theme?', removeHint: 'This removes the local copy. Export it first if you want to keep the file.', exported: 'Theme exported.', storageError: 'Could not access your local theme library.', needAccount: 'Sign in to manage community themes.', error: 'Could not complete this action.', editorTitle: 'Create a CSS theme', editHint: 'Save adds a local copy. Preview and saving leave your current theme unchanged.', current: 'Current theme', untitled: 'My theme', readOnly: 'Preview only', previewTheme: 'Preview theme', activateHint: 'Changing the theme does not change your conversations.', validation: 'Check your theme', remaining: 'CSS-only themes · Local library', noTheme: 'No community theme is active.',
  },
  pt: {
    browse: 'Explorar temas',
    websiteError: 'Não foi possível abrir o site de temas. Tenta novamente.',
    transparencyHint: 'O sistema está a reduzir a transparência. Mantém essa preferência ou escolhe explicitamente Vidro para este tema.',
    sample: 'PRÉ-VISUALIZAÇÃO FICTÍCIA', sampleActivity: 'Atividade de exemplo', sampleActivityDetails: 'Um espaço para experimentares o teu tema.',
    edit: 'Editar', background: 'Imagem de fundo (opcional)', backgroundHint: 'PNG, JPEG ou WebP, até 512 KiB. Usa theme-asset(room) no CSS.', invalidBackground: 'Escolhe uma imagem PNG, JPEG ou WebP com, no máximo, 512 KiB.', backgroundReady: 'Imagem incluída neste tema. Usa theme-asset(room) no CSS.',
    title: 'Temas da comunidade', description: 'Cria e importa temas em CSS para mudar o visual e o layout do ALTARA.', local: 'Instalados neste dispositivo. As tuas mensagens ficam no ALTARA.', create: 'Criar tema', import: 'Importar tema', example: 'Exemplo: Liquid Glass', disable: 'Desativar tema atual', empty: 'Ainda não tens temas da comunidade instalados.', active: 'Ativo', preview: 'Pré-visualizar', activate: 'Ativar', export: 'Exportar', remove: 'Remover', name: 'Nome', author: 'Autor', version: 'Versão', about: 'Descrição', css: 'CSS do tema', codeHint: 'Usa as classes e variáveis CSS do ALTARA. Sem JavaScript ou pedidos externos.', save: 'Guardar na biblioteca', cancel: 'Cancelar', close: 'Fechar', saved: 'Tema guardado na biblioteca. Ativa-o quando quiseres.', activated: 'Tema ativado.', disabled: 'Tema da comunidade desativado.', removed: 'Tema removido.', importTitle: 'Importar um tema', importHint: 'Escolhe um ficheiro .altara-theme.json ou cola o respetivo JSON. Máximo de 1,5 MiB.', file: 'Ficheiro do tema', json: 'JSON do tema', load: 'Importar para a biblioteca', invalidFile: 'Escolhe um ficheiro JSON de tema com, no máximo, 1,5 MiB.', previewHint: 'Apenas dados fictícios. Esta pré-visualização não altera o ALTARA.', removeTitle: 'Remover tema?', removeHint: 'Remove a cópia local. Exporta primeiro se quiseres guardar o ficheiro.', exported: 'Tema exportado.', storageError: 'Não foi possível aceder à tua biblioteca local de temas.', needAccount: 'Inicia sessão para gerir temas da comunidade.', error: 'Não foi possível concluir esta ação.', editorTitle: 'Criar um tema CSS', editHint: 'Guardar adiciona uma cópia local. Pré-visualizar e guardar mantêm o teu tema atual.', current: 'Tema atual', untitled: 'O meu tema', readOnly: 'Só pré-visualização', previewTheme: 'Pré-visualizar tema', activateHint: 'Mudar o tema mantém as tuas conversas.', validation: 'Verifica o tema', remaining: 'Temas em CSS · Biblioteca local', noTheme: 'Nenhum tema da comunidade está ativo.',
  },
  'pt-BR': {
    browse: 'Explorar temas',
    websiteError: 'Não foi possível abrir o site de temas. Tente novamente.',
    transparencyHint: 'O sistema está reduzindo a transparência. Mantenha essa preferência ou escolha explicitamente Vidro para este tema.',
    sample: 'PRÉ-VISUALIZAÇÃO FICTÍCIA', sampleActivity: 'Atividade de exemplo', sampleActivityDetails: 'Um espaço para experimentar seu tema.',
    edit: 'Editar', background: 'Imagem de fundo (opcional)', backgroundHint: 'PNG, JPEG ou WebP, até 512 KiB. Use theme-asset(room) no CSS.', invalidBackground: 'Escolha uma imagem PNG, JPEG ou WebP de até 512 KiB.', backgroundReady: 'Imagem incluída neste tema. Use theme-asset(room) no CSS.',
    title: 'Temas da comunidade', description: 'Crie e importe temas em CSS para mudar o visual e o layout do ALTARA.', local: 'Instalados neste dispositivo. Suas mensagens ficam no ALTARA.', create: 'Criar tema', import: 'Importar tema', example: 'Exemplo: Liquid Glass', disable: 'Desativar tema atual', empty: 'Você ainda não instalou temas da comunidade.', active: 'Ativo', preview: 'Pré-visualizar', activate: 'Ativar', export: 'Exportar', remove: 'Remover', name: 'Nome', author: 'Autor', version: 'Versão', about: 'Descrição', css: 'CSS do tema', codeHint: 'Use as classes e variáveis CSS do ALTARA. Sem JavaScript ou requisições externas.', save: 'Salvar na biblioteca', cancel: 'Cancelar', close: 'Fechar', saved: 'Tema salvo na biblioteca. Ative quando quiser.', activated: 'Tema ativado.', disabled: 'Tema da comunidade desativado.', removed: 'Tema removido.', importTitle: 'Importar um tema', importHint: 'Escolha um arquivo .altara-theme.json ou cole o JSON abaixo. Máximo de 1,5 MiB.', file: 'Arquivo do tema', json: 'JSON do tema', load: 'Importar na biblioteca', invalidFile: 'Escolha um arquivo JSON de tema de até 1,5 MiB.', previewHint: 'Somente dados fictícios. Esta pré-visualização não altera o ALTARA.', removeTitle: 'Remover tema?', removeHint: 'Remove a cópia local. Exporte primeiro se quiser guardar o arquivo.', exported: 'Tema exportado.', storageError: 'Não foi possível acessar sua biblioteca local de temas.', needAccount: 'Entre na sua conta para gerenciar temas da comunidade.', error: 'Não foi possível concluir esta ação.', editorTitle: 'Criar um tema CSS', editHint: 'Salvar adiciona uma cópia local. Pré-visualizar e salvar mantêm seu tema atual.', current: 'Tema atual', untitled: 'Meu tema', readOnly: 'Só pré-visualização', previewTheme: 'Pré-visualizar tema', activateHint: 'Mudar o tema mantém suas conversas.', validation: 'Confira o tema', remaining: 'Temas em CSS · Biblioteca local', noTheme: 'Nenhum tema da comunidade está ativo.',
  },
};

const FILE_COPY = {
  en: { description: 'Import a theme file and activate it below.', local: 'Themes are kept on this device. Importing does not activate them.', empty: 'No theme files in this folder yet.', load: 'Import theme', deactivate: 'Deactivate', saved: 'Theme imported. Activate it when you are ready.', importHint: 'Choose an .altara-theme.json file, up to 1.5 MiB. It will be added to your themes folder.', folder: 'Themes folder', browser: 'In the browser, imported themes are saved on this device. The desktop app keeps them in a folder.', cached: 'Active cached version — its file changed or is unavailable.', folderError: 'Some theme files could not be loaded. Check their format and try again.' },
  pt: { description: 'Importa um ficheiro de tema e ativa-o na lista.', local: 'Os temas ficam neste dispositivo. Importar não os ativa.', empty: 'Ainda não tens ficheiros de temas nesta pasta.', load: 'Importar tema', deactivate: 'Desativar', saved: 'Tema importado. Ativa-o quando quiseres.', importHint: 'Escolhe um ficheiro .altara-theme.json, até 1,5 MiB. Será guardado na tua pasta de temas.', folder: 'Pasta de temas', browser: 'No browser, os temas importados ficam guardados neste dispositivo. A app desktop guarda-os numa pasta.', cached: 'Versão ativa guardada — o ficheiro mudou ou está indisponível.', folderError: 'Alguns ficheiros de temas não foram carregados. Verifica o formato e tenta novamente.' },
  'pt-BR': { description: 'Importe um arquivo de tema e ative na lista.', local: 'Os temas ficam neste dispositivo. Importar não os ativa.', empty: 'Você ainda não tem arquivos de temas nesta pasta.', load: 'Importar tema', deactivate: 'Desativar', saved: 'Tema importado. Ative quando quiser.', importHint: 'Escolha um arquivo .altara-theme.json de até 1,5 MiB. Ele será salvo na sua pasta de temas.', folder: 'Pasta de temas', browser: 'No navegador, temas importados ficam salvos neste dispositivo. O app desktop usa uma pasta.', cached: 'Versão ativa salva — o arquivo mudou ou está indisponível.', folderError: 'Alguns arquivos de temas não foram carregados. Confira o formato e tente novamente.' },
};

const IMPORT_COPY = {
  en: { importDescription: 'Make ALTARA feel like yours.', chooseFile: 'Choose a theme file', dropFile: 'or drag and drop it here', replaceFile: 'Choose a different file', fileFormat: '.altara-theme.json · Up to 1.5 MiB', checkingFile: 'Checking your theme…', readyFile: 'Ready to import', savingFile: 'Importing theme…', inactiveFile: 'Importing saves the theme in your folder. You choose when to activate it.', browserInactiveFile: 'Importing saves the theme on this device. You choose when to activate it.', oneFile: 'Drop one JSON theme file at a time.', api: 'Theme API' },
  pt: { importDescription: 'Dá o teu estilo ao ALTARA.', chooseFile: 'Escolher um ficheiro de tema', dropFile: 'ou arrasta-o para aqui', replaceFile: 'Escolher outro ficheiro', fileFormat: '.altara-theme.json · Até 1,5 MiB', checkingFile: 'A verificar o teu tema…', readyFile: 'Pronto a importar', savingFile: 'A importar o tema…', inactiveFile: 'Importar guarda o tema na tua pasta. Tu escolhes quando o ativar.', browserInactiveFile: 'Importar guarda o tema neste dispositivo. Tu escolhes quando o ativar.', oneFile: 'Arrasta apenas um ficheiro JSON de tema de cada vez.', api: 'API de temas' },
  'pt-BR': { importDescription: 'Deixe o ALTARA com a sua cara.', chooseFile: 'Escolher um arquivo de tema', dropFile: 'ou arraste e solte aqui', replaceFile: 'Escolher outro arquivo', fileFormat: '.altara-theme.json · Até 1,5 MiB', checkingFile: 'Verificando seu tema…', readyFile: 'Pronto para importar', savingFile: 'Importando tema…', inactiveFile: 'Importar salva o tema na sua pasta. Você escolhe quando ativar.', browserInactiveFile: 'Importar salva o tema neste dispositivo. Você escolhe quando ativar.', oneFile: 'Solte apenas um arquivo JSON de tema por vez.', api: 'API de temas' },
};

export function createCommunityThemesUi(document, { storage, getActor, getLanguage = () => document.documentElement.lang, runtime, starterPackage, onBrowseThemes, onAccountThemes, onReviewAccountTheme, onPublish, onApplyLayoutPreset, onRestoreLayoutPreset, beforeActivate, onRemoveItem, surface = 'app', folder } = {}) {
  const mount = document.getElementById('appearanceCommunityThemes');
  if (!mount) return { refresh() {}, suspend() {}, open() {} };
  const window = document.defaultView;
  const creator = surface === 'creator';
  let actor = '', library = null, generation = 0, dialog = null, statusNode = null, opener = null;
  let unsubscribeFolder = null;
  const actorNow = () => String(getActor?.() || '').trim();
  unsubscribeFolder = folder?.subscribe?.(() => { if (actor && actor === actorNow()) refresh(); });
  const strings = () => {
    const lang = String(getLanguage?.() || '').toLowerCase();
    const locale = lang === 'pt-br' || lang === 'pt_br' ? 'pt-BR' : /^pt\b/.test(lang) ? 'pt' : 'en';
    return creator ? COPY[locale] : { ...COPY[locale], ...FILE_COPY[locale], ...IMPORT_COPY[locale] };
  };
  const text = key => {
    const value = strings()[key] || COPY.en[key] || key;
    return key === 'example' && typeof starterPackage?.name === 'string'
      ? value.replace(/Liquid Glass$/, () => starterPackage.name) : value;
  };
  function el(tag, content = '', className = '') {
    const node = document.createElement(tag);
    if (content) node.textContent = content;
    if (className) node.className = className;
    return node;
  }
  function button(key, action, className = 'btn ghost') {
    const owner = actor;
    const node = el('button', text(key), className); node.type = 'button';
    node.addEventListener('click', event => { if (node.isConnected && owner === actor && owner === actorNow()) action(event); });
    return node;
  }
  function current(ticket, owner) { return ticket === generation && owner === actor && owner === actorNow(); }
  function status(message, failed = false, target = statusNode) {
    if (!target) return;
    target.textContent = String(message || ''); target.classList.toggle('is-error', failed);
  }
  function errorText(error, fallback = 'error') { return typeof error?.message === 'string' && error.message ? error.message : text(fallback); }
  function close({ restoreFocus = true } = {}) {
    generation++;
    const old = dialog; dialog = null;
    if (old) { old.close?.(); old.remove(); }
    const focus = opener; opener = null;
    if (restoreFocus && focus?.isConnected) focus.focus?.();
  }
  function syncActor() {
    const next = actorNow();
    if (actor !== next) { close({ restoreFocus: false }); actor = next; library = null; }
    if (actor && !library) library = createCommunityThemeLibrary(storage, actor);
    return !!actor;
  }
  function modal(key, anchor, { readOnly = false } = {}) {
    close({ restoreFocus: false });
    if (!syncActor() && !readOnly) { status(text('needAccount'), true); return null; }
    opener = anchor || document.activeElement;
    const owner = actor, ticket = generation;
    const node = el('dialog', '', 'communityThemesDialog');
    node.dataset.communityThemesTrusted = 'true';
    const head = el('header', '', 'communityThemesDialog__header');
    const title = el('h2', text(key)); title.id = 'communityThemesDialogTitle';
    node.setAttribute('aria-labelledby', title.id);
    const dismiss = button('close', () => close(), 'communityThemesClose'); dismiss.setAttribute('aria-label', text('close')); dismiss.textContent = '×';
    head.append(title, dismiss);
    const body = el('div', '', 'communityThemesDialog__body');
    node.append(head, body); document.body.append(node); dialog = node;
    node.addEventListener('cancel', event => { event.preventDefault(); close(); });
    node.addEventListener('click', event => {
      if (event.target !== node) return;
      const rect = node.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    });
    node.showModal();
    return { node, body, owner, ticket, alive: () => dialog === node && node.isConnected && current(ticket, owner) };
  }
  function field(form, key, value, { multiline = false, maxLength = 240, required = false } = {}) {
    const label = el('label', '', 'communityThemesField');
    label.append(el('span', text(key)));
    const input = el(multiline ? 'textarea' : 'input');
    input.name = key; input.value = String(value || ''); input.maxLength = maxLength; input.required = required;
    if (!multiline) input.type = 'text';
    if (key === 'css' || key === 'json') { input.spellcheck = false; input.className = 'communityThemesCode'; input.rows = key === 'css' ? 15 : 10; }
    label.append(input); form.append(label); return input;
  }
  function previewBody(layout, material = 'system', shell = false) {
    const widgetSample = '<section data-theme-slot="widget-card" class="widgetCard"><h3 data-theme-slot="widget-title">Sample widget</h3><p class="widgetCard__meta">Fictional preview only</p><button class="btn primary" type="button" disabled>Sample action</button><input aria-label="Sample widget field" value="Your widget keeps its data" disabled></section>';
    // Build with the same native presenter on a detached document. This is an
    // app-owned fixture: no theme HTML, account reads or real snapshot reaches it.
    const sample = new window.DOMParser().parseFromString(PREVIEW_BODY, 'text/html');
    if (shell) sample.querySelector('.app').setAttribute('data-altara-shell-layout', 'regions-v1');
    sample.querySelector('.app').dataset.altaraThemeTransparency = ['system','glass','solid'].includes(material) ? material : 'system';
    if (!['dashboard','glass-home'].includes(layout)) {
      // Keep the sample in the conversation flow, never as a competing flex
      // sibling that can cover or squeeze the chat and its composer.
      sample.querySelector('#dmMain .dmMessages').insertAdjacentHTML('beforeend', widgetSample);
    } else {
    const main = sample.querySelector('.panel.mid'); main.replaceChildren();
    const tabs = sample.createElement('div'); tabs.className = 'midTop';
    const tab = sample.createElement('button'); tab.type = 'button'; tab.className = 'chip active'; tab.dataset.tab = 'widgets';
    tabs.append(tab); main.append(tabs);
    const home = sample.createElement('section'); home.id = 'tabWidgets'; home.dataset.themePreview = layout;
    const grid = sample.createElement('div'); grid.id = 'widgetsGrid'; grid.className = 'widgetsGrid';
    grid.innerHTML = widgetSample;
    home.append(grid); main.append(home);
    const snapshot = { themeLayout: layout, user: { name: 'Alex', status: 'focus' },
      activity: { name: text('sampleActivity'), details: text('sampleActivityDetails') },
      servers: [{ id: 'preview-atlas', name: 'Atlas Workshop', memberCount: 24 },
        { id: 'preview-garden', name: 'Quiet Garden', memberCount: 12 }, { id: 'preview-lounge', name: 'Night Lounge', memberCount: 8 }] };
    if(layout==='glass-home'){
      snapshot.contacts=[{id:'preview-mika',name:'Mika',status:'online',activity:'Example shared activity',canCall:true},{id:'preview-sam',name:'Sam',status:'idle',canCall:true}];
      snapshot.conversations=[{id:'preview-mika',name:'Mika',preview:'Fictional preview message',unread:2},{id:'preview-sam',name:'Sam',preview:'Example conversation'}];
      snapshot.quickNotes=[{id:'preview-task-one',text:'Try your own theme',completed:true},{id:'preview-task-two',text:'Review the Home layout',completed:false}];
      snapshot.focus={label:'Focus',remaining:'20:00',progress:.35,running:false,preset:'preview-work',presets:[{id:'preview-work',label:'Work'}]};
      snapshot.recentActivity=[];snapshot.today=[];
    }
    const previewAction = () => {};
    const presenter = createThemeHomePresenter(sample, { getActor: () => 'theme-preview', getSnapshot: () => snapshot,
      getLanguage, resolveImage: () => '', now: () => new Date(2026, 7, 24, 22),
      onNavigateServer: previewAction, onStatus: previewAction, onOpenMessages: previewAction,
      onOpenStore: previewAction, onOpenHome: previewAction,
      ...(layout==='glass-home'?{onOpenActivity:previewAction,onOpenProfile:previewAction,onOpenConversation:previewAction,onCallContact:previewAction,onOpenAppearance:previewAction,onOpenNotifications:previewAction,onWidgetView:previewAction,onAddQuickNote:previewAction,onToggleQuickNote:previewAction,onFocusAction:previewAction,onFocusPreset:previewAction,onJoinServer:previewAction,onSearch:()=>({servers:[],contacts:[]})}:{}) });
    if (!presenter.sync()) throw Error(text('error'));
    tab.textContent = sample.querySelector('.themeHomeNavButton.is-current')?.textContent || '';
    const right = sample.querySelector('.panel.right'); right.replaceChildren();
    const note = sample.createElement('p'); note.className = 'previewMuted'; note.textContent = text('sample'); right.append(note);
    for (const name of ['Mika', 'Sam']) { const card = sample.createElement('article'); card.className = 'widgetCard previewHomeCard';
      const title = sample.createElement('strong'); title.textContent = name;
      const info = sample.createElement('p'); info.textContent = text('readOnly'); card.append(title, info); right.append(card); }
    }
    for (const button of sample.querySelectorAll('button,input,select,textarea')) { button.disabled = true; button.setAttribute('title', text('readOnly')); }
    return sample.body.innerHTML;
  }
  function previewMaterial(pkg) {
    const running = runtime?.active?.();
    return running?.package?.css === pkg?.css && running.package.name === pkg?.name && running.package.version === pkg?.version
      ? running.material || 'system' : 'system';
  }
  function previewFrame(pkg, { material = 'system' } = {}) {
    const clean = validateCommunityThemePackage(pkg);
    const shell = compileCommunityThemeLayout(clean.css);
    let css = compileCommunityThemeCss(clean.css, { apiVersion: clean.apiVersion, assets: clean.assets || {} });
    if (shell.enabled) css += '\n' + shell.css;
    css = communityGlassCssForDocument(document, css);
    const glass = usesCommunityGlassFilter(css) ? createCommunityGlassFilter(document) : null;
    if (usesCommunityGlassFilter(css)) css = communityGlassCssForDocument(document, css, !!glass);
    const frame = el('iframe'); frame.title = text('previewTheme'); frame.className = 'communityThemesPreview';
    frame.setAttribute('sandbox', ''); frame.setAttribute('referrerpolicy', 'no-referrer');
    const safeCss = String(css).replace(/</g, '\\3c ');
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src \'none\'; script-src \'none\'; connect-src \'none\'; form-action \'none\'; base-uri \'none\'"><style>' + BASE_PREVIEW_CSS + SHELL_PREVIEW_CSS + (['dashboard','glass-home'].includes(clean.layout) ? DASHBOARD_PREVIEW_CSS : '') + widgetThemePreviewCss() + '</style><style>' + safeCss + '</style></head><body data-altara-community-theme="preview"' + (shell.enabled ? ' data-altara-shell-layout="regions-v1"' : '') + ' data-altara-theme-transparency="' + (['glass','solid'].includes(material) ? material : 'system') + '">' + (glass?.outerHTML || '') + previewBody(clean.layout, material, shell.enabled) + '</body></html>';
    return frame;
  }
  function openPreview(pkg, anchor) {
    const session = modal('previewTheme', anchor, { readOnly: true }); if (!session) return;
    try {
      const clean = validateCommunityThemePackage(pkg);
      session.body.append(el('p', clean.name, 'communityThemesPreviewName'), el('p', text('previewHint'), 'communityThemesHint'), previewFrame(clean, { material: previewMaterial(clean) }));
      session.body.append(button('close', () => close(), 'btn ghost communityThemesDialog__footerButton'));
    } catch (error) { session.body.append(el('p', errorText(error), 'communityThemesStatus is-error')); }
  }
  function openEditor(pkg, anchor, { onSave, saveLabel } = {}) {
    const session = modal('editorTitle', anchor); if (!session) return;
    const source = pkg || { ...COMMUNITY_THEME_VISUAL_STARTER, name: text('untitled') };
    const form = el('form', '', 'communityThemesForm');
    session.body.append(el('p', text('editHint'), 'communityThemesHint'), form);
    const grid = el('div', '', 'communityThemesFieldsGrid'); form.append(grid);
    const name = field(grid, 'name', source.name, { maxLength: 60, required: true });
    const author = field(grid, 'author', source.author, { maxLength: 60 });
    const version = field(grid, 'version', source.version || '1.0.0', { maxLength: 32, required: true });
    const description = field(form, 'about', source.description, { multiline: true, maxLength: 240 });
    const css = field(form, 'css', source.css, { multiline: true, maxLength: 96 * 1024, required: true });
    let apiVersion = source.apiVersion || 1, assets = { ...(source.assets || {}) };
    const layoutLabel=el('label','','communityThemesField');layoutLabel.append(el('span',/^pt/i.test(String(getLanguage()))?'Apresentação da Home':'Home presentation'));
    const layout=el('select'); layout.name='layout';
    for(const [value,label] of [['',/^pt/i.test(String(getLanguage()))?'Base':'Base'],['dashboard','Dashboard'],['glass-home','Glass Home']]){const option=el('option',label);option.value=value;layout.append(option);}
    layout.value=source.layout||'';layoutLabel.append(layout);form.append(layoutLabel);
    layout.addEventListener('change',()=>{if(session.alive()&&layout.value)apiVersion=2;});
    const visual=el('details','','communityThemesVisual');visual.open=true;visual.append(el('summary',/^pt/i.test(String(getLanguage()))?'Editor visual':'Visual editor'));
    const visualBody=el('div');visual.append(visualBody);form.insertBefore(visual,css.closest('label'));
    const advanced=el('details','','communityThemesAdvanced');advanced.open=true;advanced.append(el('summary',/^pt/i.test(String(getLanguage()))?'CSS avançado (preservado)':'Advanced CSS (preserved)'));advanced.append(css.closest('label'));form.append(advanced);
    const backgroundLabel = el('label', '', 'communityThemesField');
    backgroundLabel.append(el('span', text('background')));
    const background = el('input'); background.type = 'file'; background.accept = 'image/png,image/jpeg,image/webp';
    backgroundLabel.append(background); form.append(backgroundLabel, el('p', text('backgroundHint'), 'communityThemesHint'));
    form.append(el('p', text('codeHint'), 'communityThemesHint'));
    const issue = el('div', '', 'communityThemesStatus'); issue.setAttribute('role', 'status'); issue.setAttribute('aria-live', 'polite'); form.append(issue);
    const previewHost = el('div', '', 'communityThemesEditorPreview');
    const actions = el('div', '', 'communityThemesActions');
    const read = () => ({ format: 'altara-theme', apiVersion, name: name.value, author: author.value, version: version.value, description: description.value, css: css.value,
      ...(apiVersion === 2 ? { assets, ...(layout.value ? { layout: layout.value } : {}) } : {}) });
    const preview = button('preview', () => {
      if (!session.alive()) return;
      try { const frame = previewFrame(read(), { material: previewMaterial(source) }); previewHost.replaceChildren(el('p', text('previewHint'), 'communityThemesHint'), frame); status('', false, issue); }
      catch (error) { status(errorText(error), true, issue); }
    });
    const save = button('save', () => {}, 'btn primary'); save.type = 'submit'; if(saveLabel)save.textContent=saveLabel;
    actions.append(button('cancel', () => close()), preview, save); form.append(actions, previewHost);
    let backgroundRevision = 0;
    background.addEventListener('change', async () => {
      const file = background.files?.[0], revision = ++backgroundRevision;
      save.disabled = preview.disabled = false;
      if (!file || !session.alive()) return;
      if (file.size > MAX_BACKGROUND_BYTES || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        status(text('invalidBackground'), true, issue); return;
      }
      save.disabled = preview.disabled = true;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!session.alive() || revision !== backgroundRevision) return;
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
        const candidate = { ...read(), apiVersion: 2, assets: { ...assets, room: { mime: file.type, base64: window.btoa(binary) } } };
        const clean = validateCommunityThemePackage(candidate);
        assets = clean.assets; apiVersion = 2;
        const visualState=readVisualThemeOptions(css.value);
        if(visualState.managed)css.value=updateVisualThemeCss(css.value,visualState.options,{backgroundAsset:true});
        else if(!/theme-asset\(\s*room\s*\)/i.test(css.value))css.value+='\n/* ALTARA background image */\n.app{background-image:linear-gradient(90deg,rgba(0,0,0,.6),rgba(0,0,0,.22)),theme-asset(room);background-size:cover;background-position:center;}';
        status(text('backgroundReady'), false, issue);
      } catch (error) { if (session.alive() && revision === backgroundRevision) status(errorText(error), true, issue); }
      finally { if (session.alive() && revision === backgroundRevision) save.disabled = preview.disabled = false; }
    });
    try { mountVisualThemeEditor(document,visualBody,{css,getLanguage,alive:session.alive,hasBackground:()=>!!assets.room,onChange:()=>{apiVersion=2;status('',false,issue);},onError:error=>status(errorText(error),true,issue)}); }
    catch(error){visual.open=false;status(errorText(error),true,issue);}
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (!session.alive()) return;save.disabled=true;
      try { const clean=validateCommunityThemePackage(read()); if(onSave)await onSave(clean);else library.install(clean); if(!session.alive())return;close();refresh();status(text('saved')); }
      catch (error) { if(session.alive()) {save.disabled=false;status(errorText(error), true, issue);} }
    });
    name.focus();
  }
  function openImport(anchor) {
    if (!creator) return openFileImport(anchor);
    const session = modal('importTitle', anchor); if (!session) return;
    const form = el('form', '', 'communityThemesForm');
    session.body.append(el('p', text('importHint'), 'communityThemesHint'), form);
    const label = el('label', '', 'communityThemesField'); label.append(el('span', text('file')));
    const file = el('input'); file.type = 'file'; file.accept = '.altara-theme.json,.json,application/json'; label.append(file); form.append(label);
    const json = field(form, 'json', '', { multiline: true, maxLength: MAX_IMPORT_BYTES, required: true });
    const issue = el('div', '', 'communityThemesStatus'); issue.setAttribute('role', 'status'); issue.setAttribute('aria-live', 'polite'); form.append(issue);
    const actions = el('div', '', 'communityThemesActions');
    const save = button('load', () => {}, 'btn primary'); save.type = 'submit'; actions.append(button('cancel', () => close()), save); form.append(actions);
    let fileRevision = 0;
    file.addEventListener('change', async () => {
      const selected = file.files?.[0], revision = ++fileRevision; save.disabled = false; if (!selected || !session.alive()) return;
      if (selected.size > MAX_IMPORT_BYTES || !/\.json$/i.test(selected.name)) { status(text('invalidFile'), true, issue); return; }
      save.disabled = true;
      try {
        const contents = await selected.text();
        if (!session.alive() || revision !== fileRevision) return;
        if (new TextEncoder().encode(contents).byteLength > MAX_IMPORT_BYTES) throw Error(text('invalidFile'));
        json.value = contents; status('', false, issue);
      } catch (error) { if (session.alive() && revision === fileRevision) status(errorText(error), true, issue); }
      finally { if (session.alive() && revision === fileRevision) save.disabled = false; }
    });
    json.addEventListener('input', () => { fileRevision++; save.disabled = false; });
    form.addEventListener('submit', event => {
      event.preventDefault(); if (!session.alive()) return;
      try {
        if (new TextEncoder().encode(json.value).byteLength > MAX_IMPORT_BYTES) throw Error(text('invalidFile'));
        library.install(validateCommunityThemePackage(JSON.parse(json.value))); close(); refresh(); status(text('saved'));
      } catch (error) { status(errorText(error), true, issue); }
    });
    json.focus();
  }
  function openFileImport(anchor) {
    const session = modal('importTitle', anchor); if (!session) return;
    session.node.classList.add('communityThemeImport');
    const icon = kind => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', kind === 'check' ? 'M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0' : kind === 'file' ? 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 14h8M8 17h5' : 'M12 16V4m-4 4 4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4');
      svg.append(path); return svg;
    };
    const head = session.node.querySelector('.communityThemesDialog__header');
    const title = head.querySelector('h2');
    const heading = el('div', '', 'communityThemeImport__heading');
    const emblem = el('span', '', 'communityThemeImport__emblem'); emblem.append(icon('file'));
    const titleCopy = el('div', '', 'communityThemeImport__title'); titleCopy.append(title, el('p', text('importDescription'), 'communityThemesHint'));
    heading.append(emblem, titleCopy); head.prepend(heading);
    const form = el('form', '', 'communityThemesForm'); session.body.append(form);
    const file = el('input'); file.type = 'file'; file.accept = '.altara-theme.json,.json,application/json'; file.hidden = true; file.setAttribute('aria-label', text('file'));
    const picker = button('chooseFile', () => { if (session.alive() && !saving) file.click(); }, 'communityThemeImport__drop');
    picker.setAttribute('aria-describedby', 'communityThemeImportFormat communityThemeImportStatus');
    const upload = el('span', '', 'communityThemeImport__upload'); upload.append(icon('upload'));
    const choice = el('span', text('chooseFile'), 'communityThemeImport__choice');
    const dropHint = el('span', text('dropFile'), 'communityThemesHint');
    const format = el('span', text('fileFormat'), 'communityThemeImport__format'); format.id = 'communityThemeImportFormat';
    picker.replaceChildren(upload, choice, dropHint, format); form.append(file, picker);
    const details = el('div', '', 'communityThemeImport__details'); details.hidden = true; form.append(details);
    const issue = el('div', '', 'communityThemesStatus communityThemeImport__status'); issue.id = 'communityThemeImportStatus'; issue.setAttribute('role', 'status'); issue.setAttribute('aria-live', 'polite'); issue.setAttribute('aria-atomic', 'true'); form.append(issue);
    const inactive = el('p', text(folder ? 'inactiveFile' : 'browserInactiveFile'), 'communityThemeImport__inactive');
    inactive.id = 'communityThemeImportInactive'; session.node.setAttribute('aria-describedby', inactive.id); form.append(inactive);
    const actions = el('div', '', 'communityThemesActions communityThemeImport__actions');
    const save = button('load', () => {}, 'btn primary'); save.type = 'submit'; save.disabled = true;
    actions.append(button('cancel', () => close()), save); form.append(actions);
    let reading = 0, parsed = null, saving = false;
    async function selectFiles(files) {
      if (!session.alive() || saving) return;
      const ticket = ++reading; parsed = null; save.disabled = true;
      details.replaceChildren(); details.hidden = true; picker.classList.remove('is-dragging', 'has-file'); picker.removeAttribute('aria-invalid');
      choice.textContent = text('chooseFile'); status('', false, issue);
      const selected = files?.[0]; if (!selected) { form.setAttribute('aria-busy', 'false'); session.node.dataset.importState = 'empty'; return; }
      form.setAttribute('aria-busy', 'true'); session.node.dataset.importState = 'reading'; status(text('checkingFile'), false, issue);
      try {
        if (files.length !== 1) throw Error(text('oneFile'));
        if (!/\.json$/i.test(String(selected.name)) || !Number.isFinite(selected.size) || selected.size > MAX_IMPORT_BYTES) throw Error(text('invalidFile'));
        const contents = await selected.text();
        if (!session.alive() || ticket !== reading) return;
        if (new TextEncoder().encode(contents).byteLength > MAX_IMPORT_BYTES) throw Error(text('invalidFile'));
        parsed = validateCommunityThemePackage(contents);
        const mark = el('span', '', 'communityThemeImport__validIcon'); mark.append(icon('check'));
        const summary = el('div', '', 'communityThemeImport__summary');
        summary.append(el('h3', parsed.name), el('p', `v${parsed.version} · ${text('api')} ${parsed.apiVersion}`, 'communityThemesHint'));
        const filename = el('p', selected.name, 'communityThemeImport__filename'); filename.title = selected.name;
        const size = selected.size < 1024 ? `${selected.size} B` : `${Math.ceil(selected.size / 1024)} KiB`;
        summary.append(filename, el('small', size)); details.append(mark, summary); details.hidden = false;
        picker.classList.add('has-file'); choice.textContent = text('replaceFile'); save.disabled = false; session.node.dataset.importState = 'ready'; status(text('readyFile'), false, issue);
      } catch (error) {
        if (session.alive() && ticket === reading) { session.node.dataset.importState = 'error'; picker.setAttribute('aria-invalid', 'true'); status(errorText(error), true, issue); }
      } finally { if (session.alive() && ticket === reading) form.setAttribute('aria-busy', 'false'); }
    }
    file.addEventListener('change', () => { void selectFiles(file.files); });
    picker.addEventListener('dragover', event => {
      if (!session.alive() || saving) return;
      event.preventDefault(); picker.classList.add('is-dragging'); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
    picker.addEventListener('dragleave', event => { if (!picker.contains(event.relatedTarget)) picker.classList.remove('is-dragging'); });
    picker.addEventListener('drop', event => {
      event.preventDefault(); picker.classList.remove('is-dragging');
      if (session.alive() && !saving) { file.value = ''; void selectFiles(event.dataTransfer?.files); }
    });
    // Keep a misplaced file drop inside the modal from navigating away from ALTARA.
    session.node.addEventListener('dragover', event => event.preventDefault());
    session.node.addEventListener('drop', event => event.preventDefault());
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (!session.alive() || saving || !parsed) return;
      saving = true; save.disabled = picker.disabled = true; form.setAttribute('aria-busy', 'true'); session.node.dataset.importState = 'saving'; save.textContent = text('savingFile'); status(text('savingFile'), false, issue);
      try {
        const clean = validateCommunityThemePackage(parsed);
        if (folder) await folder.install(clean); else library.install(clean);
        if (!session.alive()) return;
        close(); refresh(); status(text('saved')); mount.querySelector(':scope > .communityThemesActions button')?.focus();
      } catch (error) { if (session.alive()) { session.node.dataset.importState = 'error'; status(errorText(error), true, issue); } }
      finally { if (session.alive()) { saving = false; save.disabled = !parsed; picker.disabled = false; save.textContent = text('load'); form.setAttribute('aria-busy', 'false'); } }
    });
    session.node.dataset.importState = 'empty'; picker.focus();
  }
  function exportTheme(id) {
    if (!syncActor()) return;
    try {
      const pkg = library.export(id);
      const json = typeof pkg === 'string' ? pkg : JSON.stringify(pkg, null, 2);
      const href = window.URL.createObjectURL(new window.Blob([json], { type: 'application/json' }));
      const a = el('a'); a.href = href; a.download = `${String(pkg?.name || 'altara-theme').replace(/[^a-z0-9_-]/gi, '-').slice(0, 60) || 'altara-theme'}.altara-theme.json`;
      a.hidden = true; document.body.append(a); a.click(); a.remove(); window.setTimeout(() => window.URL.revokeObjectURL(href), 1000); status(text('exported'));
    } catch (error) { status(errorText(error), true); }
  }
  function confirmRemove(item, anchor) {
    const session = modal('removeTitle', anchor); if (!session) return;
    session.body.append(el('p', item.package.name, 'communityThemesPreviewName'), el('p', text('removeHint'), 'communityThemesHint'));
    const issue = el('div', '', 'communityThemesStatus'); issue.setAttribute('role', 'status'); session.body.append(issue);
    const actions = el('div', '', 'communityThemesActions');
    const remove = button('remove', async () => {
      if (!session.alive()) return; remove.disabled = true;
      try {
        if (item.source && onRemoveItem) await onRemoveItem(item);
        else { if (library.read().activeId === item.id) await runtime.disable(); if (!session.alive()) return; library.remove(item.id); }
        if (!session.alive()) return; close(); refresh(); status(text('removed'));
      } catch (error) { if (session.alive()) { remove.disabled = false; status(errorText(error), true, issue); } }
    }, 'btn communityThemesRemove');
    actions.append(button('cancel', () => close()), remove); session.body.append(actions);
  }
  async function activate(id, control) {
    if (!syncActor()) return;
    const owner = actor, ticket = generation;
    control.disabled = true;
    try {
      if (beforeActivate && library.read().installs.find(item => item.id === id)?.source) await beforeActivate(id);
      if (!current(ticket, owner)) return;
      const applied = await runtime.apply(id);
      if (!current(ticket, owner)) return;
      if (!applied) { refresh(); status(text('needAccount'), true); return; }
      refresh(); status(text('activated'));
    } catch (error) { if (current(ticket, owner)) { control.disabled = false; status(errorText(error), true); } }
  }
  async function disable(control) {
    if (!syncActor()) return;
    const owner = actor, ticket = generation; control.disabled = true;
    try { await runtime.disable(); if (!current(ticket, owner)) return; refresh(); status(text('disabled')); }
    catch (error) { if (current(ticket, owner)) { control.disabled = false; status(errorText(error), true); } }
  }
  async function browseWebsite(control) {
    const owner = actor; control.disabled = true;
    try {
      const opened = await onBrowseThemes();
      if (owner !== actor || owner !== actorNow() || !mount.contains(control)) return;
      control.disabled = false;
      if (opened === false) status(text('websiteError'), true);
    } catch {
      if (owner !== actor || owner !== actorNow() || !mount.contains(control)) return;
      control.disabled = false; status(text('websiteError'), true);
    }
  }
  function refresh() {
    try {
      syncActor();
      mount.replaceChildren(); mount.dataset.communityThemesTrusted = 'true';
      const head = el('div', '', 'communityThemesHeading');
      const title = el('h3', text('title')); title.id = 'appearanceCommunityThemesTitle';
      head.append(title, el('p', text('description'), 'communityThemesHint'));
      const actions = el('div', '', 'communityThemesActions');
      const owner = actor;
      const guard = action => event => {
        if (owner && owner === actor && owner === actorNow() && mount.contains(event.currentTarget)) action(event);
      };
      const add = button('import', guard(event => openImport(event.currentTarget)));
      actions.append(add); add.disabled = !actor;
      if (!creator && typeof onBrowseThemes === 'function') {
        const browse = button('browse', guard(event => void browseWebsite(event.currentTarget)));
        browse.disabled = !actor; actions.append(browse);
      }
      if (!creator && typeof onAccountThemes === 'function') {
        const remote = el('button', /^pt/i.test(String(getLanguage())) ? 'Temas da minha conta' : 'My account themes', 'btn ghost'); remote.type = 'button'; remote.disabled = !actor;
        remote.addEventListener('click', guard(() => onAccountThemes())); actions.append(remote);
      }
      if (creator) {
        const create = button('create', guard(event => openEditor(null, event.currentTarget)));
        const example = button('example', guard(event => openEditor(starterPackage, event.currentTarget)));
        actions.prepend(create); if (starterPackage) actions.append(example);
        [create, example].forEach(control => { control.disabled = !actor; });
      }
      const data = actor ? library.read() : { installs: [], activeId: null };
      if (creator) { const off = button('disable', guard(event => void disable(event.currentTarget))); off.disabled = !data.activeId; actions.append(off); }
      statusNode = el('div', '', 'communityThemesStatus'); statusNode.setAttribute('role', 'status'); statusNode.setAttribute('aria-live', 'polite');
      const active = data.installs.find(item => item.id === data.activeId);
      const currentTheme = el('p', active ? `${text('current')}: ${active.package.name}` : text('noTheme'), 'communityThemesCurrent');
      const cards = el('div', '', 'communityThemesCards');
      for (const item of data.installs) {
        const card = el('article', '', 'communityThemesCard'); card.dataset.communityThemeId = item.id;
        const summary = el('div', '', 'communityThemesCard__summary');
        summary.append(el('h4', item.package.name), el('p', item.package.description, 'communityThemesHint'), el('small', `${(item.source?.creatorName || (!item.source && item.package.author)) ? `${item.source?.creatorName || item.package.author} · ` : ''}v${item.package.version}`));
        if (item.source) summary.append(el('small', (item.source.creatorName || item.source.creatorId) + ' · ' + (/^pt/i.test(String(getLanguage()))?'Publicação da comunidade':'Community release')));
        if (item.source?.disabled) summary.append(el('span',/^pt/i.test(String(getLanguage()))?'Versão indisponível':'Release unavailable','communityThemesBadge'));
        if (item.source?.latestReleaseId && item.source.latestReleaseId!==item.source.releaseId) summary.append(el('span',/^pt/i.test(String(getLanguage()))?'Atualização disponível':'Update available','communityThemesBadge'));
        if (item.id === data.activeId) { card.classList.add('is-active'); summary.append(el('span', text('active'), 'communityThemesBadge')); }
        const row = el('div', '', 'communityThemesActions');
        if (creator) {
          const on = button('activate', guard(event => void activate(item.id, event.currentTarget)), 'btn primary'); on.disabled = !runtime || item.id === data.activeId || item.source?.disabled === true;
          const preview=button('preview', guard(event => openPreview(item.package, event.currentTarget))), edit=button('edit', guard(event => openEditor(item.package, event.currentTarget))), exported=button('export', guard(() => exportTheme(item.id)));
          preview.disabled=item.source?.missingPackage===true || item.source?.paid===true;
          edit.disabled=exported.disabled=item.source?.missingPackage===true || item.source?.paid===true;
          row.append(preview, edit, on, exported, button('remove', guard(event => confirmRemove(item, event.currentTarget))));
        } else {
          const isActive = item.id === data.activeId;
          const folderState = folder?.getState?.();
          const fileRow = folderState?.files?.find(file => file.id === item.id);
          const toggle = button(isActive ? 'deactivate' : 'activate', guard(event => void (isActive ? disable(event.currentTarget) : activate(item.id, event.currentTarget))), isActive ? 'btn ghost' : 'btn primary');
          toggle.disabled = !runtime || (!isActive && (item.source?.disabled === true || item.source?.missingPackage === true || (!item.source && folderState?.activeFileMissing && !fileRow)));
          toggle.setAttribute('aria-pressed', String(isActive)); row.append(toggle);
          if (folderState?.activeFileMissing && isActive) summary.append(el('small', text('cached'), 'communityThemesHint'));
          if (fileRow) summary.append(el('small', fileRow.fileName, 'communityThemesFileName'));
          if (item.source && onReviewAccountTheme) {
            const review = el('button', /^pt/i.test(String(getLanguage())) ? 'Detalhes, avaliação e atualizações' : 'Details, rating & updates', 'btn ghost'); review.type = 'button'; review.addEventListener('click', guard(() => onReviewAccountTheme(item.source.projectId))); row.append(review);
          }
        }
        card.append(summary, row); cards.append(card);
      }
      if (!data.installs.length) cards.append(el('p', actor ? text('empty') : text('needAccount'), 'communityThemesEmpty'));
      mount.append(head, actions, currentTheme);
      if (!creator) {
        const folderState = folder?.getState?.();
        if (folderState?.folderPath) {
          const location = el('p', '', 'communityThemesFolderPath'); location.append(el('span', text('folder') + ': '));
          const target = el(typeof folder.openFolder === 'function' ? 'a' : 'span', folderState.folderPath);
          if (target.tagName === 'A') { target.href = '#'; target.setAttribute('aria-label', text('folder')); target.addEventListener('click', async event => { event.preventDefault(); if (owner !== actorNow() || !mount.contains(target)) return; try { await folder.openFolder(); } catch { if (owner === actorNow()) status(text('folderError'), true); } }); }
          location.append(target); mount.append(location);
        } else if (!folder) mount.append(el('p', text('browser'), 'communityThemesHint'));
        if (folderState?.errors?.length) {
          const restart = folderState.errors.some(error => error.code === 'THEME_FOLDER_RESTART_REQUIRED');
          const message = restart ? (/^pt/i.test(String(getLanguage())) ? 'Reinicia a app para carregar a pasta de temas. Os teus temas guardados continuam disponíveis.' : 'Restart the app to load the themes folder. Your saved themes remain available.') : text('folderError');
          const problem = el('div', '', 'communityThemesStatus is-error'); problem.append(el('p', message));
          const names = folderState.errors.map(error => error.fileName).filter(Boolean);
          if (names.length) problem.append(el('p', names.join(', '), 'communityThemesFileName'));
          mount.append(problem);
        }
      }
      const runningTheme = runtime?.active?.();
      const activeCss = runningTheme?.package?.css || '';
      const materialSupported = runningTheme?.package?.layout === 'glass-home' && /\[data-altara-theme-transparency\s*=/.test(activeCss);
      if (creator && materialSupported && typeof runtime?.setMaterial === 'function') {
        const pt = /^pt/i.test(String(getLanguage()));
        const field = el('label', '', 'communityThemesField');
        field.append(el('span', pt ? 'Material do tema' : 'Theme material'));
        const select = el('select'); select.dataset.themeMaterial = 'true';
        for (const [value, label] of [['system', pt ? 'Seguir o sistema' : 'Follow system'], ['glass', pt ? 'Vidro (só neste tema)' : 'Glass (this theme)'], ['solid', pt ? 'Sólido' : 'Solid']]) {
          const option = el('option', label); option.value = value; select.append(option);
        }
        select.value = runningTheme.material || 'system';
        const expectedId = runningTheme.id;
        select.addEventListener('change', () => {
          if (!owner || owner !== actor || owner !== actorNow() || !mount.contains(select) || runtime.active()?.id !== expectedId) return;
          try {
            if (!runtime.setMaterial(select.value)) throw new Error(text('needAccount'));
            refresh(); status(pt ? 'Material guardado só para este tema.' : 'Material saved for this theme only.');
          } catch (error) { select.value = runtime.active()?.material || 'system'; status(errorText(error), true); }
        });
        field.append(select); mount.append(field, el('p', pt ? 'Esta escolha fica nesta instalação e conta. O Windows e os outros temas mantêm as suas preferências.' : 'This choice belongs to this installation and account. Your system and other themes keep their preferences.', 'communityThemesHint'));
      }
      if (/theme-filter\(\s*liquid-glass\s*\)/i.test(activeCss) && (runningTheme?.material || 'system') === 'system' && window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches) {
        const hint = creator && materialSupported ? text('transparencyHint') : /^pt/i.test(String(getLanguage()))
          ? 'Esta versão do tema segue a preferência de transparência reduzida do sistema.'
          : 'This theme version follows your system’s reduced transparency preference.';
        mount.append(el('p', hint, 'communityThemesHint communityThemesTransparencyHint'));
      }
      mount.append(statusNode, cards, el('p', text('local'), 'communityThemesHint'));
    } catch (error) {
      if (!statusNode?.isConnected) { statusNode = el('div', '', 'communityThemesStatus'); statusNode.setAttribute('role', 'status'); mount.append(statusNode); }
      status(errorText(error, 'storageError'), true);
    }
  }
  function suspend() { unsubscribeFolder?.(); unsubscribeFolder = null; close({ restoreFocus: false }); actor = ''; library = null; statusNode = null; mount.replaceChildren(); }
  function open() { refresh(); mount.scrollIntoView?.({ block: 'nearest' }); }
  return { refresh, suspend, open, preview: openPreview, edit: openEditor, previewFrame, showError: error => status(errorText(error), true) };
}
