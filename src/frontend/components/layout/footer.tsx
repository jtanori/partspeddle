export function Footer() {
  return (
    <footer
      style={{
        padding: '2rem',
        borderTop: '1px solid #e5e7eb',
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#6b7280',
        fontSize: '0.875rem',
      }}
    >
      <p>
        © {new Date().getFullYear()} VINTRACK. Trust-centric collectible asset transaction
        platform.
      </p>
    </footer>
  );
}
