/*
 * Monthly H&S inspection checklists.
 * One entry per site. Edit wording here; bump `version` when items change so the
 * register records which version each inspection was done against.
 *
 * Block types
 *   items   - plain Yes / No / N/A lines
 *   assets  - one card per piece of equipment, each with the same checks (+ optional dates / type field)
 *   service - service & test dates read off the tag or record (last done / next due)
 * Item options
 *   months: [1,4,7,10]  - only due in those months; other months default to N/A with a reason
 */
window.INSPECT_CHECKLISTS = {

  compound: {
    id: 'compound',
    name: 'Maintenance compound',
    sub: 'Sheds, workshop, chemical shed, fuel bay, wash-down bay, lunchroom, compound and car park',
    version: '2026.10-1',
    everyDays: 31,
    sections: [

      { id: 'A', title: 'Defibrillators & first aid', short: 'AED & first aid', blocks: [
        { type: 'assets', id: 'aed', title: 'Defibrillators (AED)',
          note: 'Pads and battery must not expire before next month’s check. If they do, record it and order now.',
          assets: [
            { id: 'red', name: 'Red AED', where: 'Maintenance shed' },
            { id: 'yellow', name: 'Yellow AED', where: 'Maintenance shed' },
            { id: 'portable', name: 'Portable AED', where: 'Vehicle / course kit, if carried' }
          ],
          checks: [
            { id: 'status', text: 'Status light shows ready', sub: 'No warning symbol, red light or beeping' },
            { id: 'spare', text: 'Spare set of pads present' },
            { id: 'kit', text: 'Rescue kit complete', sub: 'Gloves, CPR face shield, scissors, razor, towel' },
            { id: 'sign', text: 'Signed and accessible' }
          ],
          dates: [
            { id: 'pads', label: 'Pads expiry' },
            { id: 'battery', label: 'Battery expiry' }
          ] },
        { type: 'assets', id: 'fak', title: 'First aid kits',
          note: 'Restock anything used straight away. An unlabelled or opened reliever puffer is replaced.',
          assets: [
            { id: 'lunch', name: 'Main kit', where: 'Lunchroom' },
            { id: 'portable', name: 'Portable kit', where: 'Vehicle / course' },
            { id: 'chem', name: 'Chemical shed kit', where: 'Chemical shed / mixing area, if fitted' }
          ],
          checks: [
            { id: 'sign', text: 'Signed and accessible' },
            { id: 'contents', text: 'Contents complete against the list' },
            { id: 'dates', text: 'All items in date' },
            { id: 'snake', text: 'Snake / compression bandages present' },
            { id: 'asthma', text: 'Asthma reliever in date (if stocked)' }
          ] },
        { type: 'items', items: [
          { id: 'A1', text: 'DRSABCD chart displayed at each AED / first aid point and is the current version' },
          { id: 'A2', text: 'Victorian snake identification and first aid chart displayed and current' },
          { id: 'A3', text: 'First aider and fire warden names posted at the first aid kit and noticeboard',
            sub: 'With certificate expiry dates. First Aid (HLTAID011) every 3 years, CPR every 12 months' },
          { id: 'A4', text: 'Emergency numbers (000), site address and nearest hospital posted by the phone / noticeboard' }
        ] }
      ] },

      { id: 'B', title: 'Fire equipment', short: 'Fire', blocks: [
        { type: 'assets', id: 'ext', title: 'Fire extinguishers',
          note: 'Mounted = handle no higher than 1.2 m, base at least 100 mm off the floor, sign above (AS 2444). Any extinguisher used, even partly, is replaced or recharged.',
          typeField: 'Type / size on label',
          assets: [
            { id: 'ent-abe', name: 'Shed entrance', where: 'ABE', type: 'ABE 9 kg' },
            { id: 'ent-foam', name: 'Shed entrance', where: 'Foam', type: 'Foam 9 kg' },
            { id: 'rear', name: 'Rear of shed', type: 'ABE 2.5 kg' },
            { id: 'side', name: 'Side door exit', type: 'ABE 9 kg' },
            { id: 'hoist', name: 'Hoist area', type: 'ABE 2.5 kg' },
            { id: 'mech', name: 'Mechanics area', type: 'ABE 4.5 kg' },
            { id: 'machshed', name: 'Machinery shed', where: 'Opposite trailers', type: 'ABE 9 kg' },
            { id: 'kitchen', name: 'Shed kitchen', type: 'ABE 1 kg' },
            { id: 'liion', name: 'Battery charging station', where: 'Lithium-ion extinguisher, once installed', type: 'Lithium-ion' }
          ],
          checks: [
            { id: 'gauge', text: 'Gauge in the green' },
            { id: 'pin', text: 'Pin and tamper seal intact' },
            { id: 'tag', text: 'Service tag within the last 6 months' },
            { id: 'mount', text: 'Mounted at the right height and signed' },
            { id: 'access', text: 'Clear access, nothing in front' }
          ] },
        { type: 'items', items: [
          { id: 'B1', text: 'Smoke alarms in offices and lunchroom — press test button, alarm sounds' },
          { id: 'B2', text: 'Fire blanket in shed kitchen present, in holder, signed' },
          { id: 'B3', text: 'Fire hydrant / hose reel at the compound signed, 1 m clear of shrubs and stock, no leaks' },
          { id: 'B4', text: 'Lithium-ion battery storage cabinet in place at the charging area',
            sub: 'Mark No until installed (open item from the RCW 2026 audit)' },
          { id: 'B5', text: 'Nothing stacked in front of or hanging on fire equipment' }
        ] }
      ] },

      { id: 'C', title: 'Exits, emergency lighting & evacuation', short: 'Exits', blocks: [
        { type: 'items', items: [
          { id: 'C1', text: 'Both shed exits and the marked walkways to them are completely clear',
            sub: 'No racking, tables, machines, stock or chemicals in the way' },
          { id: 'C2', text: 'Exit doors open freely from the inside — no padlocks, chains or items against them' },
          { id: 'C3', text: 'Exit signs illuminated' },
          { id: 'C4', text: 'Emergency lights: green charging indicator on, fittings undamaged' },
          { id: 'C5', text: 'Evacuation diagram at each exit, current, correct orientation (AS 3745)' },
          { id: 'C6', text: 'Emergency assembly point sign in place and visible; area clear' },
          { id: 'C7', text: 'External / security lighting working', sub: 'Check on a dark start' }
        ] }
      ] },

      { id: 'D', title: 'Workshop, electrical & gas', short: 'Workshop', blocks: [
        { type: 'items', items: [
          { id: 'D1', text: 'Switchboards: 1 m clear in front, door closes, danger / electric shock sign fitted, nothing stored nearby' },
          { id: 'D2', text: 'Test & tag: spot-check at least 10 leads and tools, all tags in date',
            sub: 'Note any out-of-date items as a defect' },
          { id: 'D3', text: 'Power boards mounted or on the bench, not hanging by the cord or daisy-chained; leads undamaged' },
          { id: 'D4', text: 'RCD test button on each switchboard works', months: [1, 4, 7, 10],
            sub: 'Quarterly: Jan, Apr, Jul, Oct. Cuts power — warn staff, check fridges, chargers and computers come back on' },
          { id: 'D5', text: 'Bench grinder and pedestal drill: guards and tool rests set, emergency stop works' },
          { id: 'D6', text: 'Hoist: pre-start sheets filled in, annual inspection tag current' },
          { id: 'D7', text: 'Air compressor / receiver: guards on, no air leaks, tank drained' },
          { id: 'D8', text: 'Battery charging area clear of cardboard and combustibles; lead-acid batteries in a tub with a Corrosive sign' },
          { id: 'D9', text: 'Oxy-acetylene cylinders upright, chained, clear of the grinder / spark area',
            sub: 'Flashback arrestors on both lines at regulator and torch, tagged within 12 months (AS 4839)' },
          { id: 'D10', text: 'LPG cylinders outside, upright, secured, at least 3 m from ignition sources, doors and drains' },
          { id: 'D11', text: 'Benches, shelving and floor clear: no trip hazards, no paper or cardboard near machines or fuel' }
        ] }
      ] },

      { id: 'E', title: 'Flammables, chemicals, fuel & wash-down bay', short: 'Chemicals & fuel', blocks: [
        { type: 'items', items: [
          { id: 'E1', text: 'Flammables cabinet: aerosols and 2-stroke / fuels inside, doors closed, nothing on top' },
          { id: 'E2', text: 'No aerosols or fuels left in the workshop, near switchboards, heaters or the grinder' },
          { id: 'E3', text: 'Fuel cans bunged, no funnels left in, stored in the cabinet or designated area' },
          { id: 'E4', text: 'Chemical shed: stored by class and segregated per the SDS; heavy containers low; nothing above shoulder height' },
          { id: 'E5', text: 'All chemicals on bunding or in tubs; IBCs on bunded pallets or drip trays; drum taps have catch trays' },
          { id: 'E6', text: 'All containers original-labelled; decanted / spray bottles labelled with contents (no Texta)' },
          { id: 'E7', text: 'SDS folder at chemical shed and mixing area covers every product; every SDS less than 5 years old' },
          { id: 'E8', text: 'Schedule 7 products locked away' },
          { id: 'E9', text: 'Spill kits at chemical shed, mixing area and fuel bay: present, full, sealed, not used as a bin' },
          { id: 'E10', text: 'Eyewash / shower: signed, access clear, dust covers on, weekly flush recorded (AS 4775)',
            sub: 'Supplied by potable mains water, not the 200 L blue drum (open item from the RCW 2026 audit)' },
          { id: 'E11', text: 'PPE store: respirators clean and sealed, cartridges in date; gloves, goggles, coveralls stocked' },
          { id: 'E12', text: 'Empty chemical containers triple-rinsed, lids off, stored for drumMUSTER' },
          { id: 'E13', text: 'Fuel bay (1000 L diesel / 1000 L unleaded): no leaks or spills, hoses and nozzles intact, tanks undamaged' },
          { id: 'E14', text: 'Fuel emergency stop identified and signed; STOP ENGINE and NO SMOKING signs in place' },
          { id: 'E15', text: 'Wash-down bay: interceptor pits not full or overflowing, grates clear, runoff contained' }
        ] }
      ] },

      { id: 'F', title: 'Plant, machinery & storage', short: 'Plant', blocks: [
        { type: 'items', items: [
          { id: 'F1', text: 'Any defective plant has an OUT OF SERVICE tag and the key removed' },
          { id: 'F2', text: 'PTO shafts and guards in place on tractors and attachments' },
          { id: 'F3', text: 'Keys not left in plant parked outside the compound; buckets lowered flat; plant parked clear of walkways' },
          { id: 'F4', text: 'Pre-start checklists completed for plant used this month' },
          { id: 'F5', text: 'Hearing protection decals on plant that needs them' },
          { id: 'F6', text: 'Seats, tyres, steps and anti-slip surfaces in good condition; no hydraulic or oil leaks' },
          { id: 'F7', text: 'Mowers and plant blown down: no grass or leaf build-up around exhausts, engines and radiators' },
          { id: 'F8', text: 'Rakes and tools on wall brackets held by safety prongs / retainers' },
          { id: 'F9', text: 'Racking: load-rating sign displayed (AS 4084), no damaged uprights or beams, high items strapped to pallets' },
          { id: 'F10', text: 'Seed, fertiliser and sand bags on pallets, off the floor' },
          { id: 'F11', text: 'Trolleys, walkie stacker and other lifting aids in good condition' }
        ] }
      ] },

      { id: 'G', title: 'Lunchroom, offices & amenities', short: 'Amenities', blocks: [
        { type: 'items', items: [
          { id: 'G1', text: 'Lunchroom noticeboard up to date',
            sub: 'H&S policy, “If You Are Injured at Work” poster, issue resolution, HSR names, latest WHS minutes, first aider list' },
          { id: 'G2', text: 'No alcohol in the staff fridge' },
          { id: 'G3', text: 'Toilets clean; soap and paper towel stocked; urinal privacy screen in place' },
          { id: 'G4', text: 'Kitchen: handwash basin for hands only; fridge and benches clean; food dated' },
          { id: 'G5', text: 'Air-conditioning vents and cassettes clean' },
          { id: 'G6', text: 'Wet-weather gear and PPE hung to dry, not on the floor' },
          { id: 'G7', text: 'Anti-fatigue mats where staff stand for long periods' },
          { id: 'G8', text: 'No roof leaks, water damage or mould' },
          { id: 'G9', text: 'Drinking water fountain filter change date marked and current' }
        ] }
      ] },

      { id: 'H', title: 'Compound, walkways & car park', short: 'Compound', blocks: [
        { type: 'items', items: [
          { id: 'H1', text: 'Pedestrian walkways clear of leaves, limbs and debris; line marking visible' },
          { id: 'H2', text: 'Paths and concrete free of cracks, lips and trip hazards' },
          { id: 'H3', text: 'Shrubs trimmed back from walkways, shed walls, exit doors and hydrants (1 m clear)' },
          { id: 'H4', text: 'Speed limit, shared zone and “Beware of Pedestrians” signs and bollards in place and visible' },
          { id: 'H5', text: 'Work areas in the car park separated from the public (bollards / cones); orange hi-vis worn there' },
          { id: 'H6', text: 'HAZCHEM sign at the gate; “No Unauthorised Entry” sign on the fence' },
          { id: 'H7', text: 'Contractor / visitor sign-in register at the shed is being used', sub: 'Check this month’s entries' },
          { id: 'H8', text: 'Bins: lids closed, not overflowing' },
          { id: 'H9', text: 'Safety signs (PPE, hearing, chemical, corrosive) in place and legible' }
        ] }
      ] },

      { id: 'I', title: 'Service & test dates', short: 'Service dates', blocks: [
        { type: 'service',
          note: 'Read the date off the tag, sticker or service record. Anything overdue becomes a defect automatically.',
          items: [
            { id: 'I1', text: 'Fire extinguishers & blanket', freq: '6-monthly (AS 1851)', by: 'Fire contractor' },
            { id: 'I2', text: 'Exit & emergency lighting', freq: '6-monthly discharge test (AS/NZS 2293.2)', by: 'Electrician' },
            { id: 'I3', text: 'Electrical test & tag', freq: 'Per tag (AS/NZS 3760)', by: 'Electrician' },
            { id: 'I4', text: 'Switchboard thermal imaging', freq: 'Annual', by: 'Electrician' },
            { id: 'I5', text: 'Workshop hoist inspection', freq: 'Annual, February', by: 'Alljacks & Hoists' },
            { id: 'I6', text: 'Oxy-acetylene flashback arrestors', freq: '12-monthly (AS 4839)', by: 'Competent person' },
            { id: 'I7', text: 'First aid kits: full restock', freq: '6-monthly', by: 'First aid officer' },
            { id: 'I8', text: 'Backflow prevention valve', freq: 'Annual', by: 'Plumber' },
            { id: 'I9', text: 'Fire hydrant flow test', freq: 'Annual', by: 'Fire contractor' },
            { id: 'I10', text: 'Evacuation drill', freq: 'Annual', by: 'Fire wardens' }
          ] }
      ] }
    ]
  },

  clubhouse: {
    id: 'clubhouse',
    name: 'Clubhouse',
    sub: 'Coming soon',
    comingSoon: true,
    sections: []
  }
};
