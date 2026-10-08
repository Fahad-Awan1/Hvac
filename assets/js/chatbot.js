/* =========================================================
   HVAC — "Breeze" chat assistant (hardcoded, no backend)
   Keyword-scored intents + a small conversational booking flow.
   History persists across pages for the session.
   ========================================================= */
(() => {
  'use strict';
  const PHONE = '(555) 014-2290';
  const TEL = 'tel:+15550142290';
  const root = document.documentElement;
  const ss = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cta = (href, label) => `<a class="msg__cta" href="${href}">${label} →</a>`;

  const MAIN_CHIPS = ['Book a service', 'AC not cooling', 'Pricing', 'Emergency help', 'Maintenance plans'];

  /* ---------- Knowledge base ---------- */
  const INTENTS = [
    { id: 'gas', w: 5, k: ['gas smell', 'smell gas', 'rotten egg', 'gas leak', 'carbon monoxide', 'co alarm', 'co detector'],
      warn: true,
      a: `<b>⚠️ Safety first.</b> If you smell gas or your CO alarm is sounding:<ul><li>Leave the home immediately and don't flip any switches</li><li>Call 911 and your gas utility from outside</li><li>Then call us on <a href="${TEL}">${PHONE}</a> and we'll dispatch an emergency tech</li></ul>`,
      chips: ['Emergency help'] },
    { id: 'emergency', w: 3, k: ['emergency', 'urgent', 'asap', 'right now', 'tonight', 'no heat', 'no ac', 'no air', 'broke down', 'broken', 'dead', 'stopped working', '24/7', '24 7', 'after hours', 'weekend'],
      a: `Our emergency line is open <b>24/7/365</b> and answered by real people. In our core area a technician is typically at your door within <b>60 minutes</b>.<br>${cta(TEL, 'Call ' + PHONE)}`,
      chips: ['AC not cooling', 'Furnace not heating', 'Book a service'] },
    { id: 'book', w: 2, k: ['book', 'booking', 'appointment', 'schedule', 'technician', 'come out', 'send someone', 'visit', 'estimate', 'quote', 'consultation', 'assessment'],
      flow: 'book' },
    { id: 'greet', k: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'yo', 'salam', 'assalam'],
      a: () => `Hey there! 👋 I'm Breeze, HVAC's virtual assistant. I can help with pricing, troubleshooting, bookings and more. What's going on with your system?`,
      chips: MAIN_CHIPS },
    { id: 'thanks', k: ['thanks', 'thank you', 'thx', 'appreciate', 'great', 'awesome', 'perfect', 'cool thanks'],
      a: `You're very welcome! Anything else I can help you with? 😊`, chips: ['Book a service', 'No, that’s all'] },
    { id: 'bye', k: ['bye', 'goodbye', 'no thats all', 'that’s all', 'thats all', 'nothing else', 'see you'],
      a: `Stay comfortable! If anything comes up, I'm right here, or call us anytime on <a href="${TEL}">${PHONE}</a>.` },
    { id: 'pricing', w: 1, k: ['price', 'pricing', 'cost', 'how much', 'charge', 'fee', 'rates', 'expensive', 'cheap', 'quote'],
      a: `Here are typical starting prices (always quoted upfront, flat-rate):<ul><li>Diagnostic visit: <b>$89</b> (waived with repair)</li><li>AC or furnace tune-up: <b>$129</b></li><li>New AC system: from <b>$4,900</b></li><li>New furnace: from <b>$3,800</b></li><li>Heat pump system: from <b>$6,500</b></li><li>Duct cleaning: from <b>$349</b></li></ul>Plan members save 15% on all repairs.`,
      chips: ['Financing options', 'Maintenance plans', 'Book a service'] },
    { id: 'ac_cost', w: 2, k: ['new ac', 'replace ac', 'ac replacement', 'new air conditioner', 'ac install', 'install ac', 'ac installation', 'central air'],
      a: `A new central AC typically runs <b>$4,900–$9,500</b> installed, depending on size, efficiency (SEER2) and ductwork. Every install includes a load calculation, permit, haul-away and a <b>10-year parts &amp; labor warranty</b>.<br>${cta('contact.html?service=install#book', 'Get a free install estimate')}`,
      chips: ['Financing options', 'What is SEER?', 'Heat pump vs furnace'] },
    { id: 'furnace_cost', w: 2, k: ['new furnace', 'replace furnace', 'furnace replacement', 'furnace cost', 'boiler replacement', 'new boiler'],
      a: `New furnaces start around <b>$3,800</b> (80% AFUE) and high-efficiency 96–98% AFUE models run <b>$5,200–$8,000</b> installed. Boilers vary more, so we'll quote on-site for free.<br>${cta('contact.html?service=heating#book', 'Book a free heating estimate')}`,
      chips: ['Financing options', 'Heat pump vs furnace'] },
    { id: 'diag', w: 2, k: ['diagnostic', 'service call', 'trip charge', 'call out fee', 'inspection fee'],
      a: `Our diagnostic visit is a flat <b>$89</b>, and it's <b>waived</b> if you go ahead with the repair. Comfort Club members pay $0.` },
    { id: 'not_cooling', w: 3, k: ['not cooling', 'warm air', 'hot air', 'blowing warm', 'ac not working', 'ac isnt', 'ac is not', 'not cold', 'house is hot', 'wont cool', 'won’t cool', 'ac running but'],
      a: `Let's try a few quick checks first:<ul><li>Thermostat set to <b>COOL</b> and below room temp?</li><li>Check the air filter. A clogged filter is the #1 cause.</li><li>Breakers for the indoor &amp; outdoor unit are ON?</li><li>Outdoor unit clear of leaves and debris?</li><li>Ice on the copper lines? Switch to FAN only for 2 hrs.</li></ul>Still warm? It may be low refrigerant, a capacitor or a compressor issue, so a tech should take a look.<br>${cta('contact.html?service=repair#book', 'Book AC repair')}`,
      chips: ['Emergency help', 'Pricing'] },
    { id: 'not_heating', w: 3, k: ['not heating', 'no heat', 'cold air', 'furnace not', 'heater not', 'heat not working', 'house is cold', 'pilot light', 'wont heat', 'won’t heat', 'boiler not'],
      a: `Quick furnace checks:<ul><li>Thermostat on <b>HEAT</b> and set above room temp, with fresh batteries?</li><li>Furnace power switch (looks like a light switch) ON?</li><li>Filter clean? A clogged filter can trip the limit switch.</li><li>Gas valve open and other gas appliances working?</li></ul>If it still won't fire up, don't keep resetting it. Let us diagnose it safely.<br>${cta('contact.html?service=heating#book', 'Book heating repair')}`,
      chips: ['Emergency help', 'Gas smell'] },
    { id: 'noise', w: 2, k: ['noise', 'noisy', 'loud', 'banging', 'rattling', 'squealing', 'buzzing', 'humming', 'clicking', 'grinding', 'screeching'],
      a: `Unusual noises usually mean something specific:<ul><li><b>Squealing</b>: belt or blower motor bearings</li><li><b>Banging / clanking</b>: loose or broken part</li><li><b>Buzzing</b>: electrical, often a failing capacitor or contactor</li><li><b>Clicking that won't stop</b>: relay or thermostat issue</li></ul>Turn the system off if it's grinding or banging, to prevent bigger damage.<br>${cta('contact.html?service=repair#book', 'Book a diagnostic')}` },
    { id: 'leak', w: 2, k: ['leak', 'leaking', 'water', 'puddle', 'dripping', 'condensate', 'drain line'],
      a: `Water around your indoor unit is usually a <b>clogged condensate drain</b> or a cracked drain pan, and sometimes a frozen coil that's thawing. Switch the system off to avoid water damage and give us a call. It's often a quick fix.<br>${cta('contact.html?service=repair#book', 'Book a repair')}` },
    { id: 'ice', w: 2, k: ['ice', 'frozen', 'freezing up', 'frost'],
      a: `A frozen coil is usually caused by <b>low airflow</b> (dirty filter, closed vents) or <b>low refrigerant</b>. Turn the AC off, run the FAN only to thaw it (1–3 hrs), and replace the filter. If it freezes again, you likely have a leak and need a tech.` },
    { id: 'smell', w: 2, k: ['smell', 'burning', 'musty', 'odor', 'odour', 'stinks'],
      a: `A brief dusty smell on the first heating day is normal. A persistent <b>burning or electrical</b> smell means switch the system off and call us. A <b>musty</b> smell points to mold in the drain pan or ducts, and our UV purification and duct cleaning fix it.<br><i>If it smells like rotten eggs, leave the house and call 911.</i>`,
      chips: ['Duct cleaning', 'Gas smell'] },
    { id: 'thermostat', w: 2, k: ['thermostat', 'nest', 'ecobee', 'smart thermostat', 'blank screen', 'wifi thermostat'],
      a: `We install and set up smart thermostats (Nest, Ecobee, Honeywell) from <b>$249</b> including the device. They typically save <b>8–12%</b> on heating &amp; cooling. If your thermostat screen is blank, try fresh batteries and check the breaker first.` },
    { id: 'bill', w: 2, k: ['high bill', 'energy bill', 'electric bill', 'bills', 'save energy', 'save money', 'efficiency', 'efficient', 'utility'],
      a: `High bills usually come from an aging system, leaky ducts (up to 30% loss!) or a dirty coil. Try our <a href="index.html#savings">Energy Savings Estimator</a> to see what an upgrade could save, or book a <b>free home energy assessment</b>.`,
      chips: ['Book a service', 'Duct cleaning'] },
    { id: 'filter', w: 2, k: ['filter', 'filters', 'merv', 'change filter', 'replace filter'],
      a: `Change 1" filters every <b>1–3 months</b> (monthly with pets or allergies), and 4–5" media filters every 6–12 months. We recommend <b>MERV 8–13</b> for most homes. Plan members get filters delivered free!` },
    { id: 'iaq', w: 2, k: ['air quality', 'allergies', 'allergy', 'asthma', 'purifier', 'purification', 'humidifier', 'dehumidifier', 'humidity', 'dust', 'uv light', 'hepa', 'mold', 'pollen', 'dry air'],
      a: `Our indoor-air-quality solutions include HEPA &amp; MERV 13 filtration, UV-C purifiers, whole-home humidifiers/dehumidifiers and ERV fresh-air systems. They remove up to <b>99% of airborne allergens</b>.<br>${cta('services.html#air', 'Explore air quality')}` },
    { id: 'ducts', w: 2, k: ['duct', 'ducts', 'ductwork', 'duct cleaning', 'vents', 'airflow', 'hot room', 'cold room', 'uneven', 'upstairs hot'],
      a: `Uneven temperatures are almost always a <b>duct or airflow</b> problem. We offer duct cleaning (from $349), Aeroseal duct sealing, and redesign/zoning for rooms that never feel right.<br>${cta('services.html#ducts', 'Ductwork services')}` },
    { id: 'heatpump', w: 2, k: ['heat pump', 'heatpump', 'heat pump vs furnace', 'vs furnace', 'mini split', 'mini-split', 'ductless'],
      a: `<b>Heat pumps</b> heat <i>and</i> cool with electricity, and they're 2–4× more efficient than electric resistance heat. Modern cold-climate models work down to −15°F. <b>Furnaces</b> are great in very cold areas with cheap gas. Many homes go <b>hybrid</b> (both!). Ductless mini-splits are perfect for additions and garages. Federal tax credits up to <b>$2,000</b> may apply.<br>${cta('services.html#heatpumps', 'Heat pump details')}` },
    { id: 'seer', w: 2, k: ['seer', 'seer2', 'afue', 'hspf', 'rating', 'efficiency rating'],
      a: `<b>SEER2</b> measures cooling efficiency, so higher means cheaper to run (the minimum is ~14–15, premium is 20+). <b>AFUE</b> is furnace efficiency (96%+ = high-efficiency). <b>HSPF2</b> is heat-pump heating efficiency. Going from SEER 10 to SEER 20 roughly halves cooling costs.` },
    { id: 'maint', w: 2, k: ['maintenance', 'tune up', 'tune-up', 'tuneup', 'service my', 'check up', 'checkup', 'how often', 'annual service', 'cleaning'],
      a: `We recommend a tune-up <b>twice a year</b>: AC in spring, heating in fall. Our 21-point tune-up is <b>$129</b>, or join the <b>Comfort Club</b> from $19/mo for 2 tune-ups, priority service and 15% off repairs.<br>${cta('plans.html', 'See maintenance plans')}`,
      chips: ['Maintenance plans', 'Book a service'] },
    { id: 'plans', w: 2, k: ['plan', 'plans', 'membership', 'comfort club', 'subscription', 'member'],
      a: `Our maintenance plans:<ul><li><b>Essential</b>: $12/mo · 1 tune-up/yr</li><li><b>Comfort Club</b>: $19/mo · 2 tune-ups, priority service, 15% off</li><li><b>Total Care</b>: $34/mo · everything + free filters &amp; no overtime fees</li></ul>${cta('plans.html', 'Compare plans')}` },
    { id: 'finance', w: 2, k: ['finance', 'financing', 'payment plan', 'monthly payment', 'credit', 'loan', '0%', 'afford', 'installments'],
      a: `Yes! We offer <b>0% APR for up to 24 months</b> and low monthly payments for up to 10 years (OAC). Most approvals take under 2 minutes, with no impact on your credit score to check.<br>${cta('plans.html#financing', 'Payment calculator')}` },
    { id: 'rebates', w: 2, k: ['rebate', 'rebates', 'tax credit', 'incentive', 'ira', 'government'],
      a: `High-efficiency heat pumps can qualify for federal tax credits up to <b>$2,000</b>, plus local utility rebates. We handle all the paperwork for you and include it in your quote.` },
    { id: 'hours', w: 2, k: ['hours', 'open', 'opening', 'closing', 'when are you', 'working hours', 'business hours', 'sunday'],
      a: `Office &amp; scheduled service: <b>Mon–Sat, 7am–8pm</b>.<br>Emergency service: <b>24/7, including holidays</b> on <a href="${TEL}">${PHONE}</a>.` },
    { id: 'area', w: 2, k: ['area', 'areas', 'service area', 'location', 'where are you', 'do you serve', 'near me', 'come to', 'cover', 'zip'],
      a: `We serve Springfield and surrounding communities within ~40 miles. Type your <b>5-digit ZIP code</b> and I'll check for you!` },
    { id: 'contact', w: 1, k: ['contact', 'phone', 'call', 'email', 'address', 'number', 'reach you', 'office'],
      a: `📞 <a href="${TEL}">${PHONE}</a> (24/7)<br>✉️ <a href="mailto:hello@hvac-comfort.com">hello@hvac-comfort.com</a><br>📍 1200 Comfort Ave, Suite 4, Springfield, IL<br>${cta('contact.html', 'Contact page')}` },
    { id: 'warranty', w: 2, k: ['warranty', 'guarantee', 'guaranteed', 'covered'],
      a: `Every new system includes a <b>10-year parts &amp; labor warranty</b>, and repairs carry a <b>1-year</b> labor guarantee. Plus our 100% satisfaction promise: if you're not happy, we'll make it right.` },
    { id: 'brands', w: 2, k: ['brand', 'brands', 'carrier', 'trane', 'lennox', 'daikin', 'mitsubishi', 'rheem', 'goodman', 'york', 'bosch', 'model'],
      a: `We service <b>all major brands</b>: Carrier, Trane, Lennox, Daikin, Mitsubishi, Rheem, Goodman, York, Bosch and more. For new installs we'll recommend the best fit for your home and budget, not just one brand.` },
    { id: 'install_time', w: 2, k: ['how long', 'install take', 'installation take', 'same day', 'how quickly', 'how fast'],
      a: `Most repairs are completed <b>same-day</b>. A standard AC or furnace replacement takes <b>4–8 hours</b> (one day). Full duct redesigns can take 2–3 days.` },
    { id: 'repair_replace', w: 2, k: ['repair or replace', 'replace or repair', 'should i replace', 'worth repairing', 'how old', 'lifespan', 'last', 'old system'],
      a: `Rule of thumb: <b>age × repair cost &gt; $5,000</b> means replace. AC and heat pumps last 12–17 years, furnaces 15–20. Try our 60-second <a href="services.html#quiz">Repair or Replace quiz</a>!` },
    { id: 'r22', w: 2, k: ['r22', 'r-22', 'freon', 'refrigerant', 'recharge'],
      a: `R-22 (Freon) was phased out in 2020, so recharges are now very expensive. If your system uses R-22 and needs refrigerant, replacement is usually the smarter investment. Newer systems use R-410A or R-454B.` },
    { id: 'commercial', w: 2, k: ['commercial', 'business', 'office', 'restaurant', 'warehouse', 'rooftop', 'rtu', 'vrf', 'building', 'property manager'],
      a: `Our commercial team handles rooftop units, VRF/VRV, chillers, make-up air and kitchen ventilation, with preventive-maintenance contracts and 24/7 priority response.<br>${cta('services.html#commercial', 'Commercial HVAC')}` },
    { id: 'license', w: 2, k: ['license', 'licensed', 'insured', 'insurance', 'certified', 'nate', 'epa', 'background'],
      a: `Yes, we're fully <b>licensed, bonded &amp; insured</b> (Lic. #HVAC-0042817). All techs are NATE &amp; EPA certified, background-checked and drug-tested.` },
    { id: 'payment', w: 2, k: ['pay', 'payment', 'credit card', 'cash', 'check', 'apple pay', 'visa'],
      a: `We accept all major credit cards, debit, Apple/Google Pay, checks, ACH and financing. Payment is due when work is complete, with no deposits on repairs.` },
    { id: 'discount', w: 2, k: ['discount', 'coupon', 'offer', 'deal', 'promo', 'senior', 'military', 'veteran', 'first responder', 'special'],
      a: `Current offers: <b>$50 off</b> any repair for first-time customers, <b>10% off</b> for seniors, military &amp; first responders, and plan members always save 15%.` },
    { id: 'careers', w: 2, k: ['job', 'jobs', 'career', 'careers', 'hiring', 'work for you', 'apprentice'],
      a: `We're always looking for great techs and apprentices! Email your resume to <a href="mailto:careers@hvac-comfort.com">careers@hvac-comfort.com</a>. We offer paid training, a company vehicle and benefits.` },
    { id: 'human', w: 3, k: ['human', 'real person', 'agent', 'representative', 'speak to someone', 'talk to someone', 'operator', 'manager'],
      a: `Of course! Our comfort advisors are available right now on <a href="${TEL}">${PHONE}</a>. Or leave your details and we'll call you back within 15 minutes.`,
      chips: ['Book a service'] },
    { id: 'about', w: 1, k: ['who are you', 'about', 'company', 'experience', 'how long have you', 'reviews', 'rating'],
      a: `HVAC has kept homes comfortable since <b>2010</b>: 12,500+ systems installed, 45+ certified technicians and a <b>4.9★ rating</b> from 1,280+ reviews.<br>${cta('about.html', 'Meet the team')}` },
    { id: 'bot', w: 2, k: ['are you a bot', 'are you human', 'are you real', 'who is breeze', 'your name'],
      a: `I'm <b>Breeze</b> 🌬️, HVAC's virtual assistant. I'm not a person, but I know a lot about heating &amp; cooling, and I can get you booked with a real technician in seconds.` },
  ];

  // chip text → canonical message
  const CHIP_ALIAS = {
    'Pricing': 'pricing', 'Emergency help': 'emergency', 'Maintenance plans': 'plans', 'Financing options': 'financing',
    'What is SEER?': 'seer', 'Heat pump vs furnace': 'heat pump vs furnace', 'Gas smell': 'gas smell', 'Duct cleaning': 'duct cleaning',
    'No, that’s all': 'thats all', 'Book a service': 'book', 'AC not cooling': 'ac not cooling', 'Furnace not heating': 'furnace not heating',
  };

  const norm = (s) => ' ' + s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9/%\- ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  function match(text) {
    const t = norm(text);
    let best = null, bestScore = 0;
    for (const it of INTENTS) {
      let s = 0;
      for (const k of it.k) {
        const kk = norm(k).replace(/[’']/g, '');
        if (t.includes(kk)) s += (k.includes(' ') ? 2 : 1) * (it.w || 1);
      }
      if (s > bestScore) { bestScore = s; best = it; }
    }
    return best;
  }

  /* ---------- UI ---------- */
  const ui = document.createElement('div');
  ui.innerHTML = `
    <button class="chat-fab" type="button" aria-label="Open chat assistant" aria-expanded="false" aria-controls="chat">
      <svg class="ic ic--chat"><use href="#i-chat"/></svg><svg class="ic ic--x"><use href="#i-close"/></svg><span class="chat-fab__ping"></span>
    </button>
    <div class="chat-teaser" role="status">👋 Need a hand? Ask me anything about heating &amp; cooling.</div>
    <section class="chat" id="chat" role="dialog" aria-label="Chat with Breeze, the HVAC assistant" aria-hidden="true">
      <header class="chat__head">
        <span class="chat__avatar"><img src="assets/img/logo-mark.svg" alt="" width="30" height="30"></span>
        <div><b>Breeze</b><small>HVAC Assistant · replies instantly</small></div>
        <div class="chat__head-actions">
          <a href="${TEL}" aria-label="Call us"><svg class="ic"><use href="#i-phone"/></svg></a>
          <button type="button" data-chat-reset aria-label="Restart conversation" title="Restart"><svg class="ic"><use href="#i-wind"/></svg></button>
          <button type="button" data-chat-close aria-label="Close chat"><svg class="ic"><use href="#i-close"/></svg></button>
        </div>
      </header>
      <div class="chat__log" aria-live="polite"></div>
      <form class="chat__form" autocomplete="off">
        <label for="chat-input" class="sr-only">Type your message</label>
        <input id="chat-input" type="text" placeholder="Ask about AC, heating, pricing…" maxlength="300">
        <button type="submit" aria-label="Send"><svg class="ic"><use href="#i-send"/></svg></button>
      </form>
      <p class="chat__foot">Automated assistant · For emergencies call ${PHONE}</p>
    </section>`;
  document.body.append(...ui.children);

  const fab = document.querySelector('.chat-fab');
  const panel = document.querySelector('.chat');
  const log = panel.querySelector('.chat__log');
  const form = panel.querySelector('.chat__form');
  const input = panel.querySelector('#chat-input');
  const teaser = document.querySelector('.chat-teaser');

  let state = ss.get('hvac-chat') || { history: [], flow: null, data: {}, name: '' };
  const save = () => ss.set('hvac-chat', state);

  function bubble(from, html, { warn = false, store = true } = {}) {
    const el = document.createElement('div');
    el.className = `msg msg--${from}${warn ? ' msg--warn' : ''}`;
    el.innerHTML = html;
    log.appendChild(el);
    if (store) { state.history.push({ from, html, warn }); if (state.history.length > 60) state.history.shift(); save(); }
    scroll();
  }
  function chips(list) {
    log.querySelectorAll('.chips').forEach((c) => c.remove());
    if (!list || !list.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'chips';
    list.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c;
      b.addEventListener('click', () => send(c, CHIP_ALIAS[c] || c));
      wrap.appendChild(b);
    });
    log.appendChild(wrap);
    state.chips = list; save();
    scroll();
  }
  const scroll = () => { log.scrollTop = log.scrollHeight; };

  function botSay(html, opts = {}) {
    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.innerHTML = '<i></i><i></i><i></i>';
    log.querySelectorAll('.chips').forEach((c) => c.remove());
    log.appendChild(typing);
    scroll();
    const delay = Math.min(450 + html.replace(/<[^>]+>/g, '').length * 5, 1500);
    return new Promise((res) => setTimeout(() => {
      typing.remove();
      bubble('bot', html, opts);
      chips(opts.chips);
      res();
    }, delay));
  }

  /* ---------- Booking flow ---------- */
  const SERVICES = ['AC repair', 'Heating repair', 'New system quote', 'Tune-up', 'Air quality', 'Other'];
  async function flow(text) {
    const t = text.trim();
    if (/^(cancel|stop|nevermind|never mind|exit)$/i.test(t)) {
      state.flow = null; state.data = {}; save();
      return botSay('No problem, booking cancelled. What else can I help with?', { chips: MAIN_CHIPS });
    }
    const d = state.data;
    switch (state.flow) {
      case 'service':
        d.service = t; state.flow = 'name'; save();
        return botSay(state.name ? `Got it: <b>${esc(t)}</b>. Is this booking for you, ${esc(state.name)}? Type your full name to confirm.` : `Got it: <b>${esc(t)}</b>. What's your name?`);
      case 'name':
        if (t.length < 2) return botSay('Could you share your name, please?');
        d.name = t; state.name = t.split(' ')[0]; state.flow = 'phone'; save();
        return botSay(`Thanks, ${esc(state.name)}! What's the best phone number to reach you?`);
      case 'phone':
        if (t.replace(/\D/g, '').length < 7) return botSay(`Hmm, that doesn't look like a phone number. Please try again (e.g. 555-123-4567), or type <b>cancel</b>.`);
        d.phone = t; state.flow = 'zip'; save();
        return botSay('And your ZIP code?');
      case 'zip':
        if (!/\b\d{5}\b/.test(t)) return botSay('Please enter a 5-digit ZIP code.');
        d.zip = t.match(/\b\d{5}\b/)[0]; state.flow = 'time'; save();
        return botSay('When works best for you?', { chips: ['ASAP / today', 'Tomorrow morning', 'Tomorrow afternoon', 'This weekend'] });
      case 'time': {
        d.time = t;
        const ref = 'HV-' + Math.floor(1000 + Math.random() * 9000);
        state.flow = null; save();
        await botSay(`✅ <b>Request received!</b><ul><li>Service: ${esc(d.service)}</li><li>Name: ${esc(d.name)}</li><li>Phone: ${esc(d.phone)}</li><li>ZIP: ${esc(d.zip)}</li><li>Time: ${esc(d.time)}</li></ul>Reference <b>${ref}</b>. A comfort advisor will call within <b>15 minutes</b> to confirm your arrival window.`);
        state.data = {}; save();
        return botSay('Anything else I can help with?', { chips: ['Pricing', 'Maintenance plans', 'No, that’s all'] });
      }
    }
  }

  /* ---------- Respond ---------- */
  async function respond(text) {
    if (state.flow) return flow(text);
    const raw = text.trim();
    const nameM = raw.match(/\b(?:my name is|call me)\s+([a-z]{2,20})\b/i)
      || (raw.split(/\s+/).length <= 3 && raw.match(/\b(?:i am|i'm|im|this is)\s+([a-z]{2,20})\b/i));
    if (nameM && !/^(not|having|looking|need|interested|trying|cold|hot|freezing|here|fine|good|ok|okay|back|done|new)$/i.test(nameM[1])) {
      state.name = nameM[1][0].toUpperCase() + nameM[1].slice(1).toLowerCase(); save();
      if (raw.split(' ').length <= 5) return botSay(`Nice to meet you, ${esc(state.name)}! How can I help today?`, { chips: MAIN_CHIPS });
    }
    const zip = raw.match(/^\s*(\d{5})\s*$/) || (/\bzip\b/i.test(raw) && raw.match(/\b(\d{5})\b/));
    if (zip) {
      const z = zip[1];
      const ok = /^62[5-7]\d\d$/.test(z);
      return botSay(ok
        ? `✓ Great news, we serve <b>${z}</b>! Same-day appointments are usually available.`
        : `${z} is outside our main zone, but we often travel for installs and commercial work. Call <a href="${TEL}">${PHONE}</a> to confirm.`,
        { chips: ['Book a service', 'Pricing'] });
    }
    const it = match(raw);
    if (!it) {
      return botSay(`I'm not 100% sure about that one${state.name ? ', ' + esc(state.name) : ''}. I can help with <b>pricing, troubleshooting, bookings, plans, financing</b> and more. Or talk to a human on <a href="${TEL}">${PHONE}</a>.`, { chips: MAIN_CHIPS });
    }
    if (it.flow === 'book') {
      state.flow = 'service'; state.data = {}; save();
      return botSay(`Let's get you booked${state.name ? ', ' + esc(state.name) : ''}! 🛠️ What do you need help with? <br><small>(Type <b>cancel</b> anytime.)</small>`, { chips: SERVICES });
    }
    const html = typeof it.a === 'function' ? it.a() : it.a;
    return botSay(html, { warn: it.warn, chips: it.chips || (it.id === 'greet' ? MAIN_CHIPS : ['Book a service', 'Something else']) });
  }

  let busy = false;
  async function send(display, value = display) {
    if (busy || !display.trim()) return;
    busy = true;
    bubble('user', esc(display));
    if (value === 'Something else') {
      await botSay('Sure, what else would you like to know?', { chips: MAIN_CHIPS });
    } else {
      await respond(value);
    }
    busy = false;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    send(v);
  });

  /* ---------- Open / close ---------- */
  let greeted = state.history.length > 0;
  function open() {
    root.classList.add('chat-open', 'chat-seen');
    fab.setAttribute('aria-expanded', 'true');
    fab.setAttribute('aria-label', 'Close chat assistant');
    panel.setAttribute('aria-hidden', 'false');
    ss.set('hvac-chat-seen', 1);
    if (!greeted) {
      greeted = true;
      const h = new Date().getHours();
      const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
      botSay(`${part}! 👋 I'm <b>Breeze</b>, your HVAC assistant. Is your system acting up, or are you planning an upgrade?`, { chips: MAIN_CHIPS });
    }
    setTimeout(() => { if (matchMedia('(pointer: fine)').matches) input.focus(); }, 350);
    scroll();
  }
  function close() {
    root.classList.remove('chat-open');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-label', 'Open chat assistant');
    panel.setAttribute('aria-hidden', 'true');
  }
  fab.addEventListener('click', () => (root.classList.contains('chat-open') ? close() : open()));
  panel.querySelector('[data-chat-close]').addEventListener('click', close);
  panel.querySelector('[data-chat-reset]').addEventListener('click', () => {
    state = { history: [], flow: null, data: {}, name: state.name };
    save();
    log.innerHTML = '';
    greeted = false;
    open();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('chat-open')) close(); });
  addEventListener('hvac:chat-open', open);
  // keep wheel scrolling inside the chat (Lenis would otherwise capture it)
  log.setAttribute('data-lenis-prevent', '');

  // restore history
  state.history.forEach((m) => bubble(m.from, m.html, { warn: m.warn, store: false }));
  if (state.chips) chips(state.chips);

  // teaser once per session
  if (ss.get('hvac-chat-seen')) root.classList.add('chat-seen');
  else {
    setTimeout(() => {
      if (root.classList.contains('chat-open')) return;
      teaser.classList.add('is-shown');
      setTimeout(() => teaser.classList.remove('is-shown'), 7000);
    }, 7000);
    teaser.addEventListener('click', open);
  }
})();
