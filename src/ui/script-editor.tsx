import { computed } from '@n3rdw1z4rd/smoke-ui';
import {
    applyScript, clearScript, editorOpen, mode, runBuild, scriptSource, scriptState,
} from '../app/store';
import { exportsHook, SCRIPT_EXAMPLES } from '../core/script';
import { Icon } from './icons';

type CodeMirrorView = import('codemirror').EditorView;

let view: CodeMirrorView | null = null;
let loading: Promise<void> | null = null;

/** Lazily loads CodeMirror the first time the editor opens. */
async function ensureEditor(host: HTMLElement): Promise<void> {
    if (view) return;
    if (loading) return loading;

    loading = (async () => {
        const [{ EditorView, basicSetup }, { javascript }, { oneDark }, { keymap }] = await Promise.all([
            import('codemirror'),
            import('@codemirror/lang-javascript'),
            import('@codemirror/theme-one-dark'),
            import('@codemirror/view'),
        ]);

        host.textContent = '';

        view = new EditorView({
            parent: host,
            doc: scriptSource.get() || SCRIPT_EXAMPLES[0].source,
            extensions: [
                keymap.of([
                    { key: 'Mod-Enter', run: () => { run(view!.state.doc.toString()); return true; } },
                    { key: 'Mod-s', run: () => { applyScript(view!.state.doc.toString()); return true; } },
                    { key: 'Escape', run: () => { editorOpen.set(false); return true; } },
                ]),
                basicSetup,
                javascript(),
                oneDark,
                EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontFamily: 'ui-monospace, Menlo, Consolas, monospace' } }),
                EditorView.updateListener.of((u) => {
                    if (u.docChanged) scriptSource.set(u.state.doc.toString());
                }),
            ],
        });

        if (!scriptSource.get()) scriptSource.set(view.state.doc.toString());
    })();

    return loading;
}

/** ctrl/⌘+enter: build() if the script has one, otherwise just save + enable it. */
function run(source: string): void {
    if (exportsHook(source, 'build')) void runBuild(source);
    else applyScript(source);
}

function setDoc(source: string): void {
    scriptSource.set(source);
    if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
}

// Keep the editor in sync when a script arrives from outside (link/import).
scriptSource.subscribe((src) => {
    if (view && view.state.doc.toString() !== src) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: src } });
    }
});

/**
 * "clear": removes the scene's script and puts the template back in the
 * editor. It throws away the editor's text, so it takes two clicks: the first
 * arms it for a few seconds.
 */
function ClearButton(): HTMLElement {
    let armed = 0;
    const btn = (
        <button className="btn" title="remove the script and reset the editor to the template">clear</button>
    ) as HTMLButtonElement;

    const disarm = () => {
        clearTimeout(armed);
        armed = 0;
        btn.textContent = 'clear';
        btn.classList.remove('danger');
    };

    btn.addEventListener('click', () => {
        if (!armed) {
            btn.textContent = 'sure?';
            btn.classList.add('danger');
            armed = window.setTimeout(disarm, 3000);
            return;
        }
        disarm();
        clearScript();
        setDoc(SCRIPT_EXAMPLES[0].source);
    });

    editorOpen.subscribe((open) => !open && armed && disarm());
    return btn;
}

export function ScriptEditor(): HTMLElement {
    const host = <div className="script-host"><div className="script-loading">loading editor…</div></div> as HTMLElement;

    const statusText = computed(() => {
        const s = scriptState.get();
        const hint = mode.get() === 'play' ? 'setup/step run on the next play' : 'ctrl/⌘+enter: run build (or save) · ctrl/⌘+s: save';
        switch (s.kind) {
            case 'running': return '● running — setup/step are live (stop to edit the scene)';
            case 'ready': return `○ ready · ${hint}`;
            case 'pending': return '⚠ this script came with a shared scene — read it, then press save or run build to trust it';
            case 'disabled': return '■ ignored — press save or run build to enable it';
            case 'error': return `✖ ${s.message}`;
            default: return `— no script · ${hint}`;
        }
    });
    const statusClass = computed(() => `script-status status-${scriptState.get().kind}`);

    const drawer = (
        <section className={computed(() => (editorOpen.get() ? 'script-drawer open' : 'script-drawer'))}>
            <header className="script-header">
                <strong>script editor</strong>
                <select
                    onChange={(e: Event) => {
                        const i = Number((e.target as HTMLSelectElement).value);
                        if (!Number.isNaN(i) && SCRIPT_EXAMPLES[i]) setDoc(SCRIPT_EXAMPLES[i].source);
                        (e.target as HTMLSelectElement).value = '';
                    }}
                >
                    <option value="">examples…</option>
                    {SCRIPT_EXAMPLES.map((ex, i) => <option value={String(i)}>{ex.name}</option>)}
                </select>
                <span className="spacer" />
                <span className="script-actions">
                    <button className="btn primary" title="run build() — regenerates its parts (ctrl/⌘+enter)" onClick={() => void runBuild()}>▶ run build</button>
                    <button className="btn" title="save and enable the script without building (ctrl/⌘+s)" onClick={() => applyScript()}>save</button>
                    <ClearButton />
                    <button className="btn icon" title="close (esc)" aria-label="close (esc)" onClick={() => editorOpen.set(false)}>
                        <Icon name="close" />
                    </button>
                </span>
            </header>
            {host}
            <pre className={statusClass}>{statusText}</pre>
        </section>
    ) as HTMLElement;

    // Clicking anywhere outside the drawer closes it. The action bar's script
    // button is excluded because it toggles the drawer itself.
    document.addEventListener('pointerdown', (ev) => {
        if (!editorOpen.get()) return;
        const target = ev.target as Element | null;
        if (!target || drawer.contains(target) || target.closest('.script-btn, dialog')) return;
        editorOpen.set(false);
    }, true);

    editorOpen.subscribe((open) => {
        drawer.inert = !open;

        if (!open) {
            if (view?.hasFocus) view.contentDOM.blur();
            return;
        }

        void ensureEditor(host).then(() => view?.focus());
    });

    return drawer;
}
