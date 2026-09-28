/**
 * Landing page (docs/design/Kitty Landing.dc.html). Static by design: illustrative values from one real
 * round, no database dependency, so the front door can't fail during a demo.
 */
import Link from 'next/link';
import { Logo, SandboxPill } from '@/components/brand';
import { Flag } from '@/components/Flag';
import { CountUp, Reveal } from '@/components/motion';
import type { Country } from '@/lib/ui/types';
import s from './landing.module.css';

const CITIES: { c: Country; city: string; rail: string; amt: string; country: string; pos: string }[] = [
  { c: 'NG', city: 'Lagos', rail: 'Paystack', amt: '₦66,438.90', country: 'Nigeria', pos: s.tl },
  { c: 'KE', city: 'Nairobi', rail: 'M-Pesa', amt: 'KSh 6,484', country: 'Kenya', pos: s.tr },
  { c: 'UG', city: 'Kampala', rail: 'MTN MoMo', amt: 'USh 193,106', country: 'Uganda', pos: s.br },
  { c: 'GH', city: 'Accra', rail: 'MTN MoMo', amt: 'GH₵581.60', country: 'Ghana', pos: s.bl },
];

const ROUNDS: { c: Country; who: string; gets: number; tint: string }[] = [
  { c: 'KE', who: 'Wanjiru · Nairobi', gets: 1, tint: '#f8e3e1' },
  { c: 'NG', who: 'Tunde · Lagos', gets: 2, tint: '#e2f1e8' },
  { c: 'UG', who: 'Nakato · Kampala', gets: 3, tint: '#f8efd2' },
  { c: 'GH', who: 'Kofi · Accra', gets: 4, tint: '#e3eaf7' },
];

const START = '/c/current';
const LIVE = '/dashboard';

export default function Landing() {
  return (
    <div className={s.page}>
      <div className={s.inner}>
        <nav className={`${s.nav} ${s.px}`}>
          <div className={s.navLeft}>
            <Logo />
            <SandboxPill />
          </div>
          <div className={s.navLinks}>
            <a href="#how">How it works</a>
            <a href="#why">Why it works</a>
            <a href="#honest">What&apos;s real</a>
            <Link href={START} className={`${s.btn} ${s.btnSm}`}>
              Start a circle
            </Link>
          </div>
        </nav>

        <section className={`${s.hero} ${s.px}`}>
          <div className={s.heroText}>
            <div className={`${s.names} k-enter`}>
              <div>
                In Lagos it&apos;s <span style={{ color: '#178a4c' }}>ajo</span>.
              </div>
              <div>
                In Accra, <span style={{ color: '#2457b0' }}>susu</span>.
              </div>
              <div>
                In Nairobi, <span style={{ color: '#c4302b' }}>chama</span>.
              </div>
            </div>
            <h1 className={`${s.h1} k-enter`} style={{ ['--k-delay' as string]: '120ms' }}>Your circle moved abroad; your money rails didn&apos;t.</h1>
            <p className={`${s.lede} k-enter`} style={{ ['--k-delay' as string]: '240ms' }}>
              Kitty runs your savings circle across Nigeria, Kenya, Uganda and Ghana. Everyone pays and gets paid on their own
              mobile money or bank. Your money stays home.
            </p>
            <div className={`${s.ctas} k-enter`} style={{ ['--k-delay' as string]: '360ms' }}>
              <Link href={START} className={`${s.btn} k-press`}>
                Start a circle
              </Link>
              <Link href={LIVE} className={`${s.btnGhost} k-press`}>
                <span className={s.live} />
                See a live round
              </Link>
            </div>
          </div>

          {/* Desktop: four cities around the $0 disc */}
          <div className={s.comp} aria-label="Four cities, each paying and paid in its own pool">
            <svg className={s.compSvg} width="600" height="540" viewBox="0 0 600 540" aria-hidden="true">
              <path className={s.march} d="M120 80H480V460H120Z" fill="none" stroke="#8f8370" strokeWidth="1.5" strokeDasharray="5 6" />
            </svg>
            <div className={s.compLabel}>recorded as FX position · no money crossed</div>
            {CITIES.map((x, i) => (
              <div key={x.c} className={`${s.city} ${x.pos} ${s.floaty}`} style={{ ['--k-i' as string]: i }}>
                <div className={s.cityHead}>
                  <Flag country={x.c} size={[24, 16]} />
                  <span className={s.cityName}>{x.city}</span>
                  <span className={s.cityRail}>{x.rail}</span>
                </div>
                <div className={s.cityAmt}>{x.amt}</div>
                <div className={s.cityNote}>Paid in and paid out in {x.country}</div>
              </div>
            ))}
            <div className={s.disc}>
              <div className={s.discLabel}>NET CROSSED A BORDER</div>
              <div className={s.discBig}>
                <CountUp value={0n} from={80000n} ccy="USD" dropZeroCents durationMs={2200} />
              </div>
              <div className={s.discSub}>$800 moved · 4 rounds</div>
            </div>
          </div>

          {/* Mobile: 2×2 with the disc overlaid */}
          <div className={s.compMobile}>
            <div className={s.mGrid}>
              {[CITIES[0], CITIES[1], CITIES[3], CITIES[2]].map((x, i) => (
                <div key={x.c} className={`${s.mCity} ${i < 2 ? s.mTop : s.mBottom} ${i % 2 ? s.mRight : ''}`}>
                  <div className={s.mHead}>
                    {i % 2 ? null : <Flag country={x.c} size={[20, 13]} />}
                    <span>{x.city}</span>
                    {i % 2 ? <Flag country={x.c} size={[20, 13]} /> : null}
                  </div>
                  <div className={s.mAmt}>{x.amt}</div>
                  <div className={s.mRail}>{x.rail}</div>
                </div>
              ))}
              <div className={s.mDisc}>
                <div className="l">
                  NET CROSSED
                  <br />A BORDER
                </div>
                <div className="b">
                  <CountUp value={0n} from={80000n} ccy="USD" dropZeroCents durationMs={2200} />
                </div>
                <div className="s">$800 moved</div>
              </div>
            </div>
            <div className={s.mCaption}>Each city pays and gets paid in its own pool.</div>
          </div>
        </section>

        <section id="how" className={s.band}>
          <div className={`${s.how} ${s.px}`}>
            <div className={s.sectionHead}>
              <h2 className={s.h2}>How it works</h2>
              <div className={s.sectionSub}>Same circle rules as home. Different plumbing.</div>
            </div>
            <Reveal className={s.steps}>
              {[
                ['01', 'Start a circle', 'Set a contribution in dollars, say $50 a round, and invite members by phone or email. Each person sees it in their own currency.'],
                ['02', 'Everyone pays at home', "Paystack in Nigeria, M-Pesa in Kenya, MTN MoMo in Uganda and Ghana. Your contribution goes into your own country's pool."],
                ['03', 'The pot lands at home', "When it's your turn, the pot is paid from your country's pool in your currency, with a provider reference you can check."],
              ].map(([n, t, b]) => (
                <div key={n} className={s.step}>
                  <div className={s.stepNo}>{n}</div>
                  <div>
                    <div className={s.stepTitle}>{t}</div>
                    <p className={s.stepBody}>{b}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        <section id="why" className={`${s.split} ${s.px}`}>
          <div className={s.splitText}>
            <h2 className={s.h2}>The circle doesn&apos;t need cross-border payments.</h2>
            <p className={s.para}>
              In a balanced circle, every member pays in exactly what they receive. Over a full cycle, zero net value needs to cross a
              border.
            </p>
            <p className={s.para}>
              Kitty&apos;s ledger records who owes whom across currencies as an FX position. Those positions build up mid-cycle and cancel
              out by the last round.
            </p>
          </div>

          <Reveal className={s.table} delay={120}>
            <div className={`${s.tr6} ${s.thead}`} role="row">
              <div>MEMBER</div>
              <div>ROUND 1</div>
              <div>ROUND 2</div>
              <div>ROUND 3</div>
              <div>ROUND 4</div>
              <div style={{ textAlign: 'right', paddingRight: 20 }}>NET</div>
            </div>
            {ROUNDS.map((r) => (
              <div key={r.c} className={s.tr6} role="row">
                <div className={s.who}>
                  <Flag country={r.c} size={[22, 15]} />
                  {r.who}
                </div>
                {[1, 2, 3, 4].map((n) =>
                  n === r.gets ? (
                    <div key={n} className={s.gets} style={{ background: r.tint }}>
                      <b>Gets $200</b>
                      <span>pays $50</span>
                    </div>
                  ) : (
                    <div key={n} className={s.cell}>
                      pays $50
                    </div>
                  ),
                )}
                <div className={s.net}>$0</div>
              </div>
            ))}
            <div className={`${s.tr6} ${s.tfoot}`} role="row">
              <div className={s.tfootLabel}>
                MOVED
                <br />
                CROSSED A BORDER
              </div>
              {[
                ['$200', '$150'],
                ['$400', '$200'],
                ['$600', '$150'],
              ].map(([m, c]) => (
                <div key={m} className={s.tfootCell}>
                  {m}
                  <br />
                  <span>{c}</span>
                </div>
              ))}
              <div className={s.tfootFinal}>
                $800
                <br />
                $0
              </div>
              <div />
            </div>
          </Reveal>

          <div className={s.tableMobile}>
            <div className={`${s.mRow} ${s.mRowHead}`}>
              <span>MEMBER</span>
              <span>PAYS · GETS</span>
              <span>NET</span>
            </div>
            {ROUNDS.map((r) => (
              <div key={r.c} className={s.mRow}>
                <span className={s.mWho}>
                  <Flag country={r.c} size={[20, 13]} />
                  {r.who.split(' · ')[0]}
                </span>
                <span className={s.mPays}>$200 · $200 R{r.gets}</span>
                <span className={s.mNet}>$0</span>
              </div>
            ))}
            <div className={s.mTotal}>Moved $800 · Net crossed a border: $0</div>
          </div>
        </section>

        <Reveal className={s.stat}>
          <div className={s.statBig}>8.78%</div>
          <div>
            <div className={s.statText}>Average cost of sending $200 to sub-Saharan Africa. 3 in 4 corridors cost more than 10%.</div>
            <div className={s.statSrc}>World Bank, Remittance Prices Worldwide, Q1 2025</div>
          </div>
          <div className={s.statCompare}>
            <div className="k">ONE 4-ROUND CIRCLE</div>
            <div className="r">Remittances: $600 across borders</div>
            <div className="z">Kitty: $0</div>
          </div>
        </Reveal>

        <section id="honest" className={`${s.split} ${s.px}`}>
          <div className={s.splitText}>
            <h2 className={s.h2}>What&apos;s real, and what isn&apos;t yet</h2>
            <p className={s.para}>This is a working product on sandbox rails. Every screen tells you which is which.</p>
          </div>
          <Reveal className={s.cards} delay={100}>
            <div className={s.card}>
              <SandboxPill />
              <div className={s.cardTitle}>Real requests, test money</div>
              <p className={s.cardBody}>Kitty calls the real Paystack, M-Pesa and MTN MoMo sandbox APIs. No real money moves.</p>
            </div>
            <div className={s.card}>
              <span className={s.chip}>Provider reference</span>
              <div className={s.cardTitle}>Every payment ends in a reference</div>
              <p className={s.cardBody}>
                Copy it and check it with the provider: <span className={s.mono}>ws_CO_270920262157154708374149</span>
              </p>
            </div>
            <div className={s.card}>
              <span className={s.chip}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M6 1.5L10.5 6 6 10.5 1.5 6z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                simulated · sandbox limit
              </span>
              <div className={s.cardTitle}>Labelled, never hidden</div>
              <p className={s.cardBody}>
                Some sandbox steps can&apos;t finish, like entering a PIN on Safaricom&apos;s test number. We still send the real request and
                label the step. <b style={{ color: 'var(--k-ink)' }}>replay</b> marks a recorded real provider response.
              </p>
            </div>
            <div className={s.card}>
              <span className={s.chip}>Licensed partner</span>
              <div className={s.cardTitle}>Only the float settles</div>
              <p className={s.cardBody}>
                If country pools ever fall out of balance, only that difference would settle, through a licensed partner.
              </p>
            </div>
          </Reveal>
        </section>

        <section className={`${s.closing} ${s.px}`}>
          <Reveal className={s.closingInner}>
            <h2 className={s.h2} style={{ maxWidth: 760 }}>
              Keep the circle together. Keep the money home.
            </h2>
            <div className={s.ctas}>
              <Link href={START} className={s.btn}>
                Start a circle
              </Link>
              <Link href={LIVE} className={s.btnGhost}>
                <span className={s.live} />
                See a live round
              </Link>
            </div>
          </Reveal>
        </section>

        <footer className={`${s.footer} ${s.px}`}>
          <span>Kitty · StacStart Build Without Borders · FinTech &amp; Commerce</span>
          <span>
            Sandbox build · no real money moves ·{' '}
            <a href="https://github.com/Manuel-dev01/kitty" style={{ color: 'inherit' }}>
              source
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}
