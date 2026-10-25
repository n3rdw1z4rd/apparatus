import { computed, Signal } from '@n3rdw1z4rd/smoke-ui';
import { Checkbox, Slider } from '@n3rdw1z4rd/smoke-ui-components';
import type { Control, CustomControl, Section } from '../app/controls';
import { seed } from '../app/store';

/* ------------------------------------------------------------------ */
/* DOM renderer for the control description in app/controls.ts         */
/* ------------------------------------------------------------------ */

function SeedInput(): HTMLElement {
    const commit = (input: HTMLInputElement) => {
        const v = parseInt(input.value);
        if (Number.isFinite(v) && v >= 0 && v !== seed.get()) seed.set(v);
        else input.value = String(seed.get());
    };

    return (
        <label className="smoke-row field">
            <span>seed</span>
            <input
                className="text-input"
                type="text"
                inputMode="numeric"
                enterKeyHint="go"
                value={computed(() => String(seed.get()))}
                title="seed for script randomness — Enter to apply"
                onKeyDown={(e: KeyboardEvent) => {
                    if (e.key !== 'Enter') return;
                    commit(e.target as HTMLInputElement);
                    (e.target as HTMLInputElement).blur();
                }}
                onChange={(e: Event) => commit(e.target as HTMLInputElement)}
            />
        </label>
    ) as HTMLElement;
}

const CUSTOM: Record<CustomControl['id'], () => HTMLElement> = {
    seed: SeedInput,
};

/** A numeric field that commits on Enter / blur, and nudges with the arrow keys. */
function NumberField(c: { label: string; signal: Signal<number>; step?: number; min?: number; max?: number }): HTMLElement {
    const commit = (input: HTMLInputElement) => {
        let v = parseFloat(input.value);
        if (!Number.isFinite(v)) {
            input.value = String(c.signal.get());
            return;
        }
        if (c.min !== undefined) v = Math.max(c.min, v);
        if (c.max !== undefined) v = Math.min(c.max, v);
        c.signal.set(v);
        input.value = String(c.signal.get());
    };

    return (
        <label className="smoke-row field">
            <span>{c.label}</span>
            <input
                className="text-input"
                type="number"
                inputMode="decimal"
                step={String(c.step ?? 1)}
                value={computed(() => String(c.signal.get()))}
                onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                onChange={(e: Event) => commit(e.target as HTMLInputElement)}
            />
        </label>
    ) as HTMLElement;
}

function renderControl(control: Control): HTMLElement {
    const el = build(control);
    if (control.visible) {
        const visible = control.visible;
        // `hidden` (not style.display) so a row's own inline display:flex survives being shown again.
        visible.subscribe((v) => (el.hidden = !v));
    }
    return el;
}

function build(c: Control): HTMLElement {
    switch (c.kind) {
        case 'slider':
            return Slider({ label: c.label, signal: c.signal, min: c.min, max: c.max, step: c.step }) as HTMLElement;

        case 'number':
            return NumberField(c);

        case 'toggle':
            return Checkbox({ label: c.label, signal: c.signal }) as HTMLElement;

        case 'color':
            return (
                <label className="smoke-row field">
                    <span>{c.label}</span>
                    <input
                        className="color-input"
                        type="color"
                        value={c.signal}
                        onInput={(e: Event) => c.signal.set((e.target as HTMLInputElement).value)}
                    />
                </label>
            ) as HTMLElement;

        case 'input':
            return (
                <label className="smoke-row field">
                    <span>{c.label}</span>
                    <input
                        className="text-input"
                        type="text"
                        placeholder={c.placeholder ?? ''}
                        value={c.signal}
                        onKeyDown={(e: KeyboardEvent) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        onChange={(e: Event) => c.signal.set((e.target as HTMLInputElement).value)}
                    />
                </label>
            ) as HTMLElement;

        case 'button':
            return (
                <button className={c.primary ? 'btn primary' : 'btn'} title={c.title ?? ''} onClick={c.action}>
                    {c.label}
                </button>
            ) as HTMLElement;

        case 'choice': {
            const select = c.select ?? ((v: any) => c.value.set(v));
            const group = (
                <div className="segmented" role="group">
                    {c.options.map((o) => (
                        <button
                            className={computed(() => (c.value.get() === o.value ? 'seg active' : 'seg'))}
                            aria-pressed={computed(() => String(c.value.get() === o.value))}
                            onClick={() => select(o.value)}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
            ) as HTMLElement;
            return c.label ? <div className="smoke-row"><span>{c.label}</span>{group}</div> as HTMLElement : group;
        }

        case 'text':
            return (
                <span className={c.tone ? computed(() => `ctl-text ${(c.tone as Signal<string>).get()}`) : 'ctl-text'}>
                    {c.text}
                </span>
            ) as HTMLElement;

        case 'custom':
            return CUSTOM[c.id]();

        case 'row':
            return <div className="row-buttons">{c.controls.map(renderControl)}</div> as HTMLElement;
    }
}

export function renderSection(section: Section): HTMLElement {
    return (
        <div className="section-body" data-section={section.id}>
            {section.controls.map(renderControl)}
        </div>
    ) as HTMLElement;
}
