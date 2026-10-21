import { Component, ReactNode } from 'react';

/** Keeps a failing widget (e.g. the map) from blanking the whole page. */
export default class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error(err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}