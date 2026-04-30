import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof console !== 'undefined') {
      console.error('Aura crashed:', error, info?.componentStack);
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl3 bg-cream-50/90 backdrop-blur-sm shadow-soft border border-cream-200/60 p-8 text-center">
          <h1 className="font-display text-2xl text-ink-700 mb-2">
            Er ging iets mis
          </h1>
          <p className="text-ink-500 text-sm leading-relaxed mb-6">
            Aura kon dit scherm niet laden. Probeer de pagina opnieuw te laden — je gegevens blijven veilig opgeslagen.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-sage-500 hover:bg-sage-600 text-cream-50 px-5 py-3 font-medium transition"
          >
            Pagina herladen
          </button>
        </div>
      </div>
    );
  }
}
