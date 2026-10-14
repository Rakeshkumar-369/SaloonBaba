import { useState } from 'react';
import { Button, Input, Notice, useAction, KV } from '../../ui/kit.jsx';
import Icon from '../../ui/Icon.jsx';
import { api } from '../../lib/api.js';
import { navigate } from '../../lib/router.jsx';
import { dateShort } from '../../lib/format.js';

export default function Verify({ code: initial }) {
  const [code, setCode] = useState(initial || '');
  const [res, setRes] = useState(null);
  const [run, busy] = useAction();
  const check = (e) => {
    e?.preventDefault();
    run(async () => setRes(await api(`/public/verify/${encodeURIComponent(code.trim())}`))).catch(() => {});
  };
  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} className="row" style={{ color: 'var(--text)', fontWeight: 800 }}><img src="/icon.svg" width="26" height="26" alt="" />SaloonBaba</a>
      <div className="card col mt-l">
        <div className="row"><Icon name="qr" size={28} /><h1 style={{ margin: 0 }}>Is this product genuine?</h1></div>
        <p className="muted small">Enter the code printed under the scratch label (or scan the QR on the pack). Try <b>SB-VEDA2026</b>.</p>
        <form onSubmit={check} className="row">
          <div className="grow"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SB-XXXXXXXX" required /></div>
          <Button busy={busy} type="submit">Verify</Button>
        </form>
        {res && (
          <Notice tone={!res.genuine ? 'bad' : res.suspicious ? 'warn' : 'good'} icon={res.genuine ? 'shield' : 'alert'}>
            <b>{res.message}</b>
            {res.genuine && (
              <div className="mt"><KV items={[['Product', res.product], ['Brand', res.brand], ['Batch', res.batch_no], ['Expiry', dateShort(res.expiry_date)], ['Times scanned', res.scans]]} /></div>
            )}
          </Notice>
        )}
      </div>
    </div>
  );
}
