import Link from 'next/link';

export default function Home() {
  return (
    <main className="wrap" style={{ maxWidth: 720, paddingTop: 64 }}>
      <div className="brand" style={{ fontSize: '2.4em' }}>Kitty</div>
      <p style={{ fontSize: '1.2em' }}>
        In Lagos it’s ajo. In Accra, susu. In Nairobi, chama. Your circle moved abroad; your money rails didn’t.
      </p>
      <p className="muted">
        One savings circle across four countries. Every member pays and is paid on their own local rail: Paystack, M-Pesa, MTN
        MoMo. A double-entry ledger records each cross-border fact as an FX position, and over a full cycle those positions net to
        zero. The circle doesn’t need cross-border payments.
      </p>
      <div className="actions" style={{ marginTop: 24 }}>
        <Link className="btn go" href="/dashboard">
          Open the judge dashboard
        </Link>
      </div>
      <p className="muted" style={{ fontSize: '0.85em', marginTop: 32 }}>
        Sandbox and test money only. Steps limited by a sandbox are labelled on screen as <b>replay</b> or{' '}
        <b>simulated · sandbox limit</b>, never silently.
      </p>
    </main>
  );
}
