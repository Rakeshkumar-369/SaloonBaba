import { useState } from 'react';
import Icon from './Icon.jsx';
import { Sheet, Button, Empty, Select } from './kit.jsx';
import { Link, navigate, useLocation } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api, post } from '../lib/api.js';
import { ago } from '../lib/format.js';
import { LANGS } from '../lib/i18n.js';

/**
 * App shell: sticky top bar, sidebar on desktop, bottom tab bar + "More" sheet on phones.
 * nav: [{ to, label, icon, primary, section }]
 */
export default function Shell({ nav, children, title, topExtra, langSwitch = false, base }) {
  const { user, unread, logout, setLang, refresh } = useAuth();
  const [more, setMore] = useState(false);
  const [notes, setNotes] = useState(null);
  const [menu, setMenu] = useState(false);
  const { path } = useLocation();
  const primary = nav.filter((n) => n.primary).slice(0, 4);
  const isActive = (to) => (to === base ? path === to : path === to || path.startsWith(`${to}/`));
  const moreActive = !primary.some((n) => isActive(n.to));

  const openNotes = async () => {
    setNotes([]);
    const rows = await api('/me/notifications');
    setNotes(rows);
    if (unread) {
      await post('/me/notifications/read');
      refresh();
    }
  };

  let lastSection = null;
  return (
    <div className="shell has-side">
      <aside className="sidenav" aria-label="Main navigation">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}><img src="/icon.svg" alt="" width="28" height="28" />SaloonBaba</a>
        {nav.map((n) => {
          const sec = n.section && n.section !== lastSection ? (lastSection = n.section) : null;
          return [
            sec && <div key={`s-${sec}`} className="section">{sec}</div>,
            <Link key={n.to} to={n.to} exact={n.to === base} className="">{<Icon name={n.icon} size={18} />}{n.label}</Link>,
          ];
        })}
      </aside>
      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}><img src="/icon.svg" alt="" width="28" height="28" /></a>
          <div className={`grow ellipsis bold ${topExtra ? 'title-when-switch' : ''}`} style={{ fontSize: 16 }}>{title}</div>
          {topExtra && <div className="grow hide-desktop" />}
          {topExtra}
          {user && (
            <button className="icon-btn" onClick={openNotes} aria-label="Notifications">
              <Icon name="bell" />{unread > 0 && <span className="dot" />}
            </button>
          )}
          {user && (
            <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Account">
              <Icon name="user" />
            </button>
          )}
        </header>
        {children}
      </div>
      <nav className="bottomnav" aria-label="Tabs">
        {primary.map((n) => (
          <Link key={n.to} to={n.to} exact={n.to === base}><Icon name={n.icon} size={22} />{n.label}</Link>
        ))}
        {nav.length > primary.length && (
          <button className={moreActive ? 'active' : ''} onClick={() => setMore(true)}><Icon name="grid" size={22} />More</button>
        )}
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="All modules">
        <div className="grid-2">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} exact={n.to === base} className="card flat row" onClick={() => setMore(false)} activeClass="active-tile">
              <span style={{ color: 'var(--primary)' }}><Icon name={n.icon} /></span>
              <span className="small bold" style={{ color: 'var(--text)' }}>{n.label}</span>
            </Link>
          ))}
        </div>
      </Sheet>

      <Sheet open={notes !== null} onClose={() => setNotes(null)} title="Notifications">
        {notes?.length ? (
          <div className="list">
            {notes.map((n) => (
              <div key={n.id} className="list-item">
                <Icon name="bell" />
                <div className="grow">
                  <div className="title small">{n.title}</div>
                  {n.body && <div className="meta">{n.body}</div>}
                  <div className="tiny muted">{ago(n.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty icon="bell" title="No notifications" />}
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title={user?.name || 'Account'}>
        <div className="col">
          <div className="muted small">{user?.email || user?.phone} · {user?.role?.replace('_', ' ')}</div>
          {langSwitch && (
            <Select label="Language / भाषा / மொழி" value={user?.lang || 'en'} onChange={(e) => setLang(e.target.value)} options={LANGS} />
          )}
          <Button variant="ghost" icon="globe" onClick={() => { setMenu(false); navigate('/'); }}>SaloonBaba website</Button>
          <Button variant="ghost" icon="refresh" onClick={() => { setMenu(false); logout(); navigate('/login'); }}>Switch demo account</Button>
          <Button variant="danger" icon="logout" onClick={() => { logout(); navigate('/'); }}>Log out</Button>
        </div>
      </Sheet>
    </div>
  );
}
