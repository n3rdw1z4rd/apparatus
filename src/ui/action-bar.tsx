import { computed } from '@n3rdw1z4rd/smoke-ui';
import {
    addNewPart, deleteSelected, editorOpen, fitView, mode, paused, scriptState, selected, stepOnce, togglePause, togglePlay,
} from '../app/store';
import { toggleDock, toggleUi } from '../app/ui-state';
import { Icon } from './icons';

const Btn = ({ label, onClick, children, className, hidden, state }: {
    label: string; onClick: () => void; children?: any; className?: string; hidden?: () => boolean; state?: () => string;
}) => {
    const el = <button className={`fab-btn ${className ?? ''}`} aria-label={label} title={label} onClick={onClick}>{children}</button> as HTMLElement;
    if (hidden) computed(hidden).subscribe((h) => (el.hidden = h));
    if (state) computed(state).subscribe((s) => el.setAttribute('data-state', s));
    return el;
};

const building = () => mode.get() === 'build';

/** Floating, thumb-sized actions so nothing is keyboard-only. */
export function ActionBar(): HTMLElement {
    return (
        <div className="action-bar" role="toolbar" aria-label="apparatus">
            <Btn label="play / stop (space)" className="play-btn" state={() => mode.get()} onClick={togglePlay}>
                <span className={computed(() => (building() ? 'swap' : 'swap hide'))}><Icon name="play" /></span>
                <span className={computed(() => (building() ? 'swap hide' : 'swap'))}><Icon name="stop" /></span>
            </Btn>
            <Btn label="pause / resume (p)" onClick={togglePause} hidden={building}>
                <span className={computed(() => (paused.get() ? 'swap' : 'swap hide'))}><Icon name="play" /></span>
                <span className={computed(() => (paused.get() ? 'swap hide' : 'swap'))}><Icon name="pause" /></span>
            </Btn>
            <Btn label="one physics step (.)" className="wide-only" onClick={stepOnce}><Icon name="step" /></Btn>
            <Btn label="add a box (b)" onClick={() => addNewPart('box')} hidden={() => !building()}><Icon name="box" /></Btn>
            <Btn label="add a ball (o)" onClick={() => addNewPart('ball')} hidden={() => !building()}><Icon name="ball" /></Btn>
            <Btn label="delete selected (del)" onClick={deleteSelected} hidden={() => !building() || selected.get() === null}><Icon name="trash" /></Btn>
            <Btn label="fit view (f)" className="wide-only" onClick={fitView}><Icon name="fit" /></Btn>
            <Btn
                label="script editor (e)"
                className="script-btn"
                state={() => scriptState.get().kind}
                onClick={() => editorOpen.set(!editorOpen.get())}
            >
                <Icon name="code" />
            </Btn>
            <Btn label="toggle panel (tab)" onClick={toggleDock}><Icon name="panel" /></Btn>
            <Btn label="hide UI (h)" className="hide-ui" onClick={toggleUi}><Icon name="eyeOff" /></Btn>
            <Btn label="show UI (h)" className="show-ui" onClick={toggleUi}><Icon name="eye" /></Btn>
        </div>
    ) as HTMLElement;
}
