// Premium Theme System for Overmind

export type ThemeName = 'default' | 'obsidian' | 'cyber' | 'midnight';

export interface Theme {
  name: ThemeName;
  displayName: string;
  colors: {
    primary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    // Add more as needed
  };
  className: string;
}

export const themes: Record<ThemeName, Theme> = {
  default: {
    name: 'default',
    displayName: 'Default',
    colors: {
      primary: '#3b82f6',
      accent: '#10b981',
      background: '#0f172a',
      surface: '#1e2937',
      text: '#f8fafc',
    },
    className: 'theme-default',
  },
  obsidian: {
    name: 'obsidian',
    displayName: 'Obsidian',
    colors: {
      primary: '#c026d3', // magenta
      accent: '#14b8a6', // teal
      background: '#0a0a0a',
      surface: '#1a1a1a',
      text: '#e0f2f1',
    },
    className: 'theme-obsidian',
  },
  cyber: {
    name: 'cyber',
    displayName: 'Cyber',
    colors: {
      primary: '#22d3ee',
      accent: '#f472b6',
      background: '#050505',
      surface: '#111827',
      text: '#67e8f9',
    },
    className: 'theme-cyber',
  },
  midnight: {
    name: 'midnight',
    displayName: 'Midnight',
    colors: {
      primary: '#a3a3a3',
      accent: '#eab308',
      background: '#020617',
      surface: '#0f172a',
      text: '#e2e8f0',
    },
    className: 'theme-midnight',
  },
};

// Tailwind config extension suggestion
