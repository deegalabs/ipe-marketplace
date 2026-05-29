/// Small "v0.1.0 · abc1234" line for footer + wallet menu. Links the SHA to
/// the GitHub commit so support can jump straight to the code that's live.
/// Constants are injected at build time by vite.config.ts (define:).

const GITHUB_REPO = 'https://github.com/deegalabs/ipe-marketplace';

export function VersionBadge({ className = '' }: { className?: string }) {
  return (
    <p className={`text-2xs font-mono text-ipe-ink-50 ${className}`}>
      v{__APP_VERSION__}
      {' · '}
      <a
        href={`${GITHUB_REPO}/commit/${__COMMIT_SHA__}`}
        target="_blank"
        rel="noreferrer"
        className="hover:text-ipe-ink underline-offset-2 hover:underline"
        title="View this commit on GitHub"
      >
        {__COMMIT_SHA__}
      </a>
    </p>
  );
}
