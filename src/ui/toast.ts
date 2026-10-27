let host: HTMLElement | null = null;

export function toast(message: string, isError = false): void {
    if (!host) {
        host = document.createElement('div');
        host.className = 'toasts';
        // Inside the app shell so it can sit above the dock (uses the shell's --inset-* vars).
        (document.querySelector('.app') ?? document.body).append(host);
    }

    const el = document.createElement('div');
    el.className = isError ? 'toast toast-error' : 'toast';
    el.textContent = message;
    host.append(el);

    setTimeout(() => el.classList.add('toast-out'), isError ? 4500 : 2200);
    setTimeout(() => el.remove(), isError ? 5000 : 2700);
}
