import { Component, type ReactNode } from 'react';
import { buildBackup } from '../store';
import { saveFile, stamp } from './util';

/**
 * Last line of defence: if a screen crashes (for example on a damaged record), show what
 * happened and let the user save their data, instead of a blank page whose only way out is
 * clearing site data — which would delete the notebook. React only offers this as a class.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error; saved?: string }> {
  state: { error?: Error; saved?: string } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  private save = async () => {
    try {
      const name = `birdtally-rescue-${stamp()}.json`;
      await saveFile(name, JSON.stringify(await buildBackup('backup')), 'application/json');
      this.setState({ saved: `Saved ${name}.` });
    } catch (e) {
      this.setState({ saved: `Could not save: ${(e as Error).message}` });
    }
  };

  render() {
    const { error, saved } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="screen stack" role="alert">
        <h1>Something went wrong</h1>
        <p>BirdTally hit an error and stopped this screen. Your entries are still on this device.</p>
        <p className="muted small">{error.message}</p>
        <div className="row wrap">
          <button className="btn primary" onClick={this.save}>Save a backup file</button>
          <button className="btn" onClick={() => location.reload()}>Reload</button>
        </div>
        {saved && <div className="small">{saved}</div>}
      </div>
    );
  }
}
