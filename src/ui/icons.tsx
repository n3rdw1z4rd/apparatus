/* Tiny inline SVG icon set (24×24, stroke = currentColor). */

const PATHS: Record<string, string> = {
    play: 'M8 5v14l11-7z',
    pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
    step: 'M6 5v14l9-7zM17 5h2v14h-2z',
    restart: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
    code: 'M9 7l-5 5 5 5M15 7l5 5-5 5',
    panel: 'M4 5h16v14H4zM14 5v14',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.2 6.2C3.6 8 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.2-.9M9.9 9.9a3 3 0 0 0 4.2 4.2',
    vr: 'M3 8h18v9h-6l-2-3h-2l-2 3H3zM7.5 12.5h.01M16.5 12.5h.01',
    close: 'M6 6l12 12M18 6L6 18',
    stop: 'M6 6h12v12H6z',
    box: 'M4 7h16v10H4z',
    ball: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
    trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
    fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    hammer: 'M14 4l6 6-3 3-6-6zM11 7L4 14l3 3 7-7',
};

export function Icon({ name }: { name: keyof typeof PATHS | string }): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', `icon icon-${name}`);
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', PATHS[name] ?? '');
    svg.append(path);
    return svg;
}
