import { SCRIPT_NODE_TEMPLATE } from '@n3rdw1z4rd/core/graph';
import { h } from './dom';
import { doc, registry, resumeScripts, saveScript, scriptsSuspended, scriptsTrusted, trustScripts } from './state';

/* ------------------------------------------------------------------ */
/* Script nodes: write a node type by hand (an ES module exporting      */
/* inputs / params / outputs / run). Saved into the graph document, so  */
/* the graph file carries its own node types.                           */
/* ------------------------------------------------------------------ */

type View = import('codemirror').EditorView;

let panel: HTMLElement | null = null;
let view: View | null = null;
let current = '';
let onAdd: (type: string) => void = () => {};

/** Called with a type when the panel's "add to graph" is pressed. */
export function setScriptAddHandler(fn: (type: string) => void): void {
    onAdd = fn;
}

export function closeScriptPanel(): void {
    panel?.remove();
    panel = null;
    view?.destroy();
    view = null;
}

/** Opens the panel on a script type (or the first one; or a new one if there are none). */
export async function openScriptPanel(type?: string): Promise<void> {
    closeScriptPanel();
    const types = Object.keys(doc.scripts ?? {});
    current = type ?? types[0] ?? '';

    const picker = h('select', { className: 'gw-select sp-picker', title: 'script node types in this graph' });
    const status = h('div', { className: 'sp-status' });
    const host = h('div', { className: 'sp-editor' }, 'loading editor…');
    const nameInput = h('input', { className: 'gw-text', type: 'text', placeholder: 'new type name, e.g. my/zigzag' });

    const refreshPicker = () => {
        const all = Object.keys(doc.scripts ?? {});
        picker.replaceChildren(...all.map((t) => h('option', { value: t }, t)));
        picker.value = current;
        picker.disabled = !all.length;
    };

    const save = async () => {
        if (!view || !current) return;
        try {
            const how = await saveScript(current, view.state.doc.toString());
            status.className = 'sp-status ok';
            status.textContent = how === 'compiled' ? `saved · ${current} compiled` : `saved · ${current} (script nodes are paused: resume to run it)`;
            refreshPicker();
        } catch (err) {
            status.className = 'sp-status err';
            status.textContent = (err as Error).message;
        }
    };

    const load = (t: string) => {
        current = t;
        const source = doc.scripts?.[t] ?? SCRIPT_NODE_TEMPLATE;
        view?.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
        status.className = 'sp-status';
        status.textContent = t ? `${t}${registry.get(t) ? '' : ' · not compiled yet'}` : 'name a new type to start';
    };

    const create = () => {
        const name = nameInput.value.trim().replace(/\s+/g, '-');
        if (!name) return nameInput.focus();
        const t = name.includes('/') ? name : `scripts/${name}`;
        if (registry.get(t) && !doc.scripts?.[t]) {
            status.className = 'sp-status err';
            status.textContent = `${t} is a built-in type — pick another name`;
            return;
        }
        nameInput.value = '';
        current = t;
        load(t);
        void save();
    };

    picker.addEventListener('change', () => load(picker.value));
    nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && create());

    panel = h('aside', { className: 'script-panel' },
        h('div', { className: 'sp-bar' },
            h('b', {}, 'script nodes'),
            picker,
            h('button', { className: 'btn', title: 'save and compile (ctrl/⌘+s)', onclick: () => void save() }, 'save'),
            h('button', { className: 'btn', title: 'add a node of this type to the graph', onclick: () => current && onAdd(current) }, '+ to graph'),
            h('button', { className: 'btn', title: 'close (esc)', onclick: closeScriptPanel }, '✕')),
        h('div', { className: 'sp-bar' }, nameInput, h('button', { className: 'btn', onclick: create }, 'new type')),
        scriptsSuspended.get()
            ? h('div', { className: 'sp-status err' }, 'Script nodes are paused after the graph stopped responding. Fix the stuck script and save, then ',
                h('button', { className: 'btn', onclick: () => { resumeScripts(); closeScriptPanel(); } }, 'resume'))
            : null,
        !scriptsTrusted.get()
            ? h('div', { className: 'sp-status err' }, 'This graph came from a file: its scripts are not running. ',
                h('button', { className: 'btn', onclick: () => { trustScripts(); closeScriptPanel(); } }, 'trust and run them'))
            : null,
        host,
        status);
    panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeScriptPanel();
    });
    document.body.append(panel);
    refreshPicker();

    const [{ EditorView, basicSetup }, { javascript }, { oneDark }, { keymap }] = await Promise.all([
        import('codemirror'),
        import('@codemirror/lang-javascript'),
        import('@codemirror/theme-one-dark'),
        import('@codemirror/view'),
    ]);
    if (!panel) return; // closed while loading
    host.textContent = '';
    view = new EditorView({
        parent: host,
        doc: '',
        extensions: [
            keymap.of([{ key: 'Mod-s', run: () => { void save(); return true; } }]),
            basicSetup,
            javascript(),
            oneDark,
            EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontFamily: 'ui-monospace, Menlo, Consolas, monospace' } }),
        ],
    });
    load(current);
    if (!current) nameInput.focus();
    else view.focus();
}
