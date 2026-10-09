/** @type {import('tailwindcss').Config} */

/**
 * Every colour resolves to a token in ./tokens.css — never to a literal.
 * The `tok()` helper keeps Tailwind's alpha modifiers (`bg-accent/40`) working
 * by handing the opacity to `color-mix()` instead of baking in a preset value.
 */
const tok = (name) => ({ opacityValue }) =>
  opacityValue === undefined || opacityValue === null || opacityValue === ""
    ? `var(--color-${name})`
    : `color-mix(in srgb, var(--color-${name}) calc(${opacityValue} * 100%), transparent)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: tok("paper"),
        paper2: tok("paper-2"),
        paper3: tok("paper-3"),
        surface: tok("surface"),
        surface2: tok("surface-2"),
        rail: tok("paper-2"),
        railline: tok("rail-line"),
        ink: tok("ink"),
        ink2: tok("ink-2"),
        muted: tok("muted"),
        soft: tok("soft"),
        accent: tok("accent"),
        accentdeep: tok("accent-deep"),
        accenttint: tok("accent-tint"),
        accentsoft: tok("accent-soft"),
        rule: tok("rule"),
        rulestrong: tok("rule-strong"),
        ok: tok("ok"),
        oktint: tok("ok-tint"),
        okline: tok("ok-line"),
        warn: tok("warn"),
        warntint: tok("warn-tint"),
        warnline: tok("warn-line"),
        wait: tok("wait"),
        waittint: tok("wait-tint"),
        waitline: tok("wait-line"),
        work: tok("work"),
        worktint: tok("work-tint"),
        workline: tok("work-line"),
        idle: tok("idle"),
        idletint: tok("idle-tint"),
        idleline: tok("idle-line"),
        danger: tok("danger"),
        dangertint: tok("danger-tint"),
        focus: tok("focus"),
        scrim: tok("scrim"),
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["var(--text-xs)", { lineHeight: "1.35" }],
        sm: ["var(--text-sm)", { lineHeight: "1.45" }],
        base: ["var(--text-base)", { lineHeight: "1.55" }],
        md: ["var(--text-md)", { lineHeight: "1.45" }],
        lg: ["var(--text-lg)", { lineHeight: "1.35" }],
        xl: ["var(--text-xl)", { lineHeight: "1.25" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "1.2" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "1.15" }],
      },
      borderRadius: {
        tag: "var(--radius-tag)",
        input: "var(--radius-input)",
        control: "var(--radius-control)",
        card: "var(--radius-card)",
        sheet: "var(--radius-sheet)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        in: "var(--ease-in)",
        "in-out": "var(--ease-in-out)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        slow: "var(--dur-slow)",
      },
    },
  },
  plugins: [],
};

