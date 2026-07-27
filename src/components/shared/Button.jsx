/**
 * Caldera-styled button component
 * Variants: primary (ember pill), secondary (outlined), ghost (text only)
 */

export default function Button({
  children,
  variant = 'primary',
  size = 'default',
  onClick,
  disabled = false,
  fullWidth = false,
  icon = null,
  ...props
}) {
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontFamily: 'var(--font-body)',
    fontWeight: 'var(--weight-medium)',
    fontSize: size === 'sm' ? 'var(--text-sm)' : 'var(--text-base)',
    lineHeight: 1,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all var(--transition-fast)',
    userSelect: 'none',
    width: fullWidth ? '100%' : 'auto',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
  }

  const variants = {
    primary: {
      ...baseStyles,
      backgroundColor: 'var(--color-ember)',
      color: 'var(--color-obsidian)',
      padding: size === 'sm' ? '8px 16px' : '12px 24px',
      borderRadius: 'var(--radius-pill)',
    },
    secondary: {
      ...baseStyles,
      backgroundColor: 'transparent',
      color: 'var(--color-text)',
      padding: size === 'sm' ? '8px 16px' : '12px 24px',
      borderRadius: 'var(--radius-xl)',
      border: '1.5px solid var(--color-border-strong)',
    },
    ghost: {
      ...baseStyles,
      backgroundColor: 'transparent',
      color: 'var(--color-text-secondary)',
      padding: size === 'sm' ? '6px 10px' : '8px 12px',
      borderRadius: 'var(--radius-pill)',
    },
    danger: {
      ...baseStyles,
      backgroundColor: '#e05252',
      color: '#ffffff',
      padding: size === 'sm' ? '8px 16px' : '12px 24px',
      borderRadius: 'var(--radius-pill)',
    },
  }

  const handleHover = (e) => {
    if (variant === 'primary') {
      e.target.style.backgroundColor = 'var(--color-ember-hover)'
      e.target.style.transform = 'translateY(-1px)'
    } else if (variant === 'secondary') {
      e.target.style.backgroundColor = 'var(--color-border)'
    } else if (variant === 'ghost') {
      e.target.style.backgroundColor = 'var(--color-border)'
    }
  }

  const handleLeave = (e) => {
    if (variant === 'primary') {
      e.target.style.backgroundColor = 'var(--color-ember)'
      e.target.style.transform = 'translateY(0)'
    } else {
      e.target.style.backgroundColor = 'transparent'
    }
  }

  return (
    <button
      style={variants[variant] || variants.primary}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={handleHover}
      onMouseLeave={handleLeave}
      disabled={disabled}
      {...props}
    >
      {icon && <span style={{ fontSize: '1.1em' }}>{icon}</span>}
      {children}
    </button>
  )
}
