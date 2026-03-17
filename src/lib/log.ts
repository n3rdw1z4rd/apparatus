export const log = (import.meta.env.DEV || import.meta.env.MODE === 'development') ? console.debug.bind(console, '[dev]') : (..._: any[]) => { };
