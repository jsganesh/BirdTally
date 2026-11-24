import { Dialog } from './Dialog';

/** Asks before recording a bird that is not on the trip's regional species lists. */
export function UnusualSheet({ name, regions, onRecord, onCancel }: { name: string; regions: string; onRecord: () => void; onCancel: () => void }) {
  return (
    <Dialog label="Unusual bird" onClose={onCancel}>
      <h2>{name} is unusual here</h2>
      <p style={{ margin: 0 }}>
        It is not on the <a href="https://ebird.org" target="_blank" rel="noreferrer">eBird.org</a> species list for {regions}, so it has never been reported there. Check the
        identification. If it is real, record it anyway: eBird reviewers will ask for a description or photo.
      </p>
      <div className="row wrap">
        <button className="btn grow" onClick={onCancel}>Cancel</button>
        <button className="btn primary grow" onClick={onRecord}>Record anyway</button>
      </div>
    </Dialog>
  );
}
