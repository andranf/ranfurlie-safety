/*
 * Monthly H&S inspection checklists.
 * One entry per site. Edit wording here; bump `version` when items change so the
 * register records which version each inspection was done against.
 *
 * Block types
 *   items   - plain Yes / No / N/A lines
 *   assets  - one card per piece of equipment, each with the same checks (+ optional dates / type field)
 *   service - service & test dates read off the tag or record (last done / next due)
 * Item / check options
 *   months: [1,4,7,10]  - only due in those months; other months default to N/A with a reason (no N/A in a due month)
 *   photo: 'what to photograph' - a photo is required when the line is answered Yes (every No needs a photo anyway)
 *   noNA: true          - Yes or No only (equipment that must be there, or a check that is always due)
 * Asset block options
 *   photo: 'what to photograph' - one photo for each card
 *   addable: true       - the inspector can add one that isn't on the list (recorded in the register)
 *   dates[].hint        - where to find the date
 * Service item option
 *   hint                - where to read the date
 *
 * Sources: Diamond Consulting monthly ESM / H&S reports (Dec 2024 - Jun 2025), RCW Safety Solutions audits
 * (clubhouse and course maintenance, inspected 2 Mar 2026) and management responses, the Ranfurlie emergency
 * plans (clubhouse & range V2.2, maintenance V3), the 7 Oct 2026 emergency plan review, Neil Taylor's 2025
 * signage review and first aid / AED logs, the AESM report 2025, the Amstel Group risk register, WHS committee
 * minutes to Sep 2026, and the first compound inspection (14 Oct 2026).
 */
window.INSPECT_CHECKLISTS = {

  compound: {
    id: 'compound',
    name: 'Maintenance compound',
    sub: 'Sheds, workshop, chemical shed, fuel bay, wash-down bay, lunchroom, compound, car park and the course lightning shelters',
    version: '2026.10-2',
    everyDays: 31,
    sections: [

      { id: 'A', title: 'Defibrillators & first aid', short: 'AED & first aid', blocks: [
        { type: 'assets', id: 'aed', title: 'Defibrillators (AED)',
          note: 'Pads and battery must not expire before next month’s check. If they do, record it and order now. Diamond’s last record (Jun 2025) had the Yellow AED at 8 Sep 2026 and the Red AED at 15 Nov 2026. Can’t find a date? Tap “Can’t find the date” so it gets followed up.',
          photo: 'the AED with its ready light showing, and the pad packet use-by date',
          addable: true, addName: 'e.g. AED in the spray rig',
          assets: [
            { id: 'red', name: 'Red AED', where: 'Maintenance shed' },
            { id: 'yellow', name: 'Yellow AED', where: 'Maintenance shed' },
            { id: 'portable', name: 'Portable AED', where: 'Vehicle / course kit, if carried' }
          ],
          checks: [
            { id: 'status', text: 'Status light shows ready', sub: 'No warning symbol, red light or beeping' },
            { id: 'spare', text: 'Spare set of pads present' },
            { id: 'kit', text: 'Rescue kit complete', sub: 'Gloves, CPR face shield, scissors, razor, towel' },
            { id: 'sign', text: 'Signed, visible and nothing in front of it' }
          ],
          dates: [
            { id: 'pads', label: 'Pads expiry', hint: 'Use-by date printed on the sealed pad packet (look through the clear lid or open the case).' },
            { id: 'battery', label: 'Battery expiry', hint: 'Install-by / expiry date on the battery label. Some units show it on the screen after the self-test.' }
          ] },
        { type: 'assets', id: 'shelter', title: 'Lightning shelters on the course: AED & first aid kit',
          note: 'Fitted Fri 23 Oct 2026 by Initial (Rentokil), contract 54162052-P2 & P3. Initial services and restocks them: if anything is missing or used, tell Andy so Initial can be called.',
          typeField: 'Which hole / where',
          photo: 'the AED and first aid kit on the shelter board',
          assets: [
            { id: 's1', name: 'Lightning shelter 1' },
            { id: 's2', name: 'Lightning shelter 2' }
          ],
          checks: [
            { id: 'aed', text: 'AED status light shows ready; cabinet closed, dry and undamaged' },
            { id: 'fak', text: 'First aid kit present, closed and complete (seal unbroken)' },
            { id: 'sign', text: 'AED, first aid and emergency signs on the board readable' }
          ],
          dates: [
            { id: 'pads', label: 'AED pads expiry', hint: 'On the sealed pad packet.' },
            { id: 'battery', label: 'AED battery expiry', hint: 'On the battery label or shown after the self-test.' }
          ] },
        { type: 'assets', id: 'fak', title: 'First aid kits',
          note: 'Every kit needs a contents list inside it: that list is what you check against. No list = answer No and say so. Restock anything used straight away.',
          addable: true,
          assets: [
            { id: 'lunch', name: 'Main kit', where: 'Lunchroom' },
            { id: 'portable', name: 'Portable kit', where: 'Vehicle / course' },
            { id: 'chem', name: 'Chemical shed kit', where: 'Chemical shed / mixing area, if fitted' }
          ],
          checks: [
            { id: 'sign', text: 'Signed and accessible' },
            { id: 'contents', text: 'Contents list inside the kit, and everything on it is there', photo: 'the open kit' },
            { id: 'dates', text: 'All items in date' },
            { id: 'snake', text: 'At least 2 snake / compression bandages' },
            { id: 'asthma', text: 'Asthma reliever and spacer in date (if the contents list includes them)' }
          ] },
        { type: 'items', items: [
          { id: 'A1', text: 'DRSABCD chart displayed at each AED / first aid point and is the current version' },
          { id: 'A2', text: 'Victorian snake identification and first aid chart displayed and current' },
          { id: 'A3', text: 'First aider names posted at the first aid kit and noticeboard',
            sub: 'With certificate expiry dates. First Aid (HLTAID011) every 3 years, CPR every 12 months' },
          { id: 'A4', text: 'Emergency numbers (000), site address and nearest hospital posted by the phone / noticeboard' },
          { id: 'A5', text: 'Any AED or first aid kit taken out or used since the last check was reported (incident report in Tanda) and restocked',
            sub: 'WHS committee, Sep 2026: report it whenever a kit or defib is taken out, whether it was used or not' }
        ] }
      ] },

      { id: 'B', title: 'Fire equipment', short: 'Fire', blocks: [
        { type: 'assets', id: 'ext', title: 'Fire extinguishers',
          note: 'Mounted = handle no higher than 1.2 m, base at least 100 mm off the floor, sign above (AS 2444). Any extinguisher used, even partly, is replaced or recharged. If two names here are really the same extinguisher, mark one N/A and say which. Found one that isn’t listed? Add it.',
          typeField: 'Type / size on label',
          addable: true, addName: 'e.g. Extinguisher by the wash-down bay',
          assets: [
            { id: 'ent-abe', name: 'Shed entrance', where: 'ABE', type: 'ABE 9 kg' },
            { id: 'ent-foam', name: 'Shed entrance', where: 'Foam', type: 'Foam 9 kg' },
            { id: 'rear', name: 'Rear of shed', type: 'ABE 2.5 kg' },
            { id: 'side', name: 'Side door exit', type: 'ABE 9 kg' },
            { id: 'hoist', name: 'Hoist area', where: 'Next to the hoist', type: 'ABE 2.5 kg' },
            { id: 'mech', name: 'Mechanics area', where: 'Needs a location sign (RCW 2026)', type: 'ABE 4.5 kg' },
            { id: 'machshed', name: 'Machinery shed', where: 'Opposite trailers', type: 'ABE 9 kg' },
            { id: 'kitchen', name: 'Shed kitchen', type: 'ABE 1 kg' }
          ],
          checks: [
            { id: 'gauge', text: 'Gauge in the green' },
            { id: 'pin', text: 'Pin and tamper seal intact' },
            { id: 'tag', text: 'Service tag within the last 6 months' },
            { id: 'mount', text: 'Mounted at the right height and signed' },
            { id: 'access', text: 'Clear access, nothing in front' }
          ] },
        { type: 'items', items: [
          { id: 'B1', text: 'Smoke alarms in offices and lunchroom: press the test button, alarm sounds; alarms mounted, not loose' },
          { id: 'B2', text: 'Fire blanket in shed kitchen present, in holder, signed' },
          { id: 'B3', text: 'Fire hydrant / hose reel at the compound signed, 1 m clear of shrubs and stock, no leaks' },
          { id: 'B4', text: 'Lithium-ion extinguisher and battery storage cabinet installed at the charging area', noNA: true,
            sub: 'Open RCW 2026 audit item. Answer No until both are in.' },
          { id: 'B5', text: 'Nothing stacked in front of or hanging on fire equipment' },
          { id: 'B6', text: 'Extinguishers on plant (excavator, tractors, spray units): present, gauge in the green, tag within 6 months',
            sub: 'Diamond (Mar 2025) found the excavator extinguisher overdue' }
        ] }
      ] },

      { id: 'C', title: 'Exits, emergency lighting & evacuation', short: 'Exits', blocks: [
        { type: 'items', items: [
          { id: 'C1', text: 'Main shed: both exits and the marked walkways to them completely clear',
            sub: 'No racking, tables, machines, stock or chemicals in the way', photo: 'the walkway to the fire exit' },
          { id: 'C8', text: 'Machinery (second) shed: a clear walkway to its exit, nothing parked or stored in the way' },
          { id: 'C2', text: 'Exit doors open freely from the inside: no padlocks, chains or items against them', noNA: true },
          { id: 'C3', text: 'Exit signs illuminated in the main shed and the machinery shed' },
          { id: 'C4', text: 'Emergency lights: green charging indicator on, fittings undamaged' },
          { id: 'C5', text: 'Evacuation diagram at each exit and in the lunchroom: current and the right way round (AS 3745)',
            sub: 'The maintenance emergency plan has 4 diagrams for the maintenance area' },
          { id: 'C6', text: 'Assembly point B sign in place south of the maintenance shed near the dam, visible, area clear' },
          { id: 'C9', text: 'Fire warden names and photos posted on the noticeboard',
            sub: 'Wardens have been appointed but weren’t posted (14 Oct 2026)' },
          { id: 'C10', text: 'Monthly communications check: two-way radios work across the course; megaphone / siren works', noNA: true,
            sub: 'Emergency plan section 6.2. Add the course warning sirens once they’re installed.' },
          { id: 'C7', text: 'External / security lighting working', sub: 'Check on a dark start' }
        ] }
      ] },

      { id: 'D', title: 'Workshop, electrical & gas', short: 'Workshop', blocks: [
        { type: 'items', items: [
          { id: 'D1', text: 'Switchboards: 1 m clear in front, door closes, danger / electric shock sign fitted, nothing stored nearby', noNA: true },
          { id: 'D2', text: 'Test & tag: spot-check at least 10 leads and tools, all tags in date',
            sub: 'Note any out-of-date items as a defect' },
          { id: 'D3', text: 'Power boards mounted or on the bench, not hanging by the cord or daisy-chained; chargers mounted; leads undamaged' },
          { id: 'D4', text: 'RCD test button on each switchboard works', months: [1, 4, 7, 10],
            sub: 'Quarterly: Jan, Apr, Jul, Oct. Cuts power: warn staff first, then check fridges, chargers and computers come back on' },
          { id: 'D5', text: 'Bench grinder and pedestal drill: guards and tool rests set, emergency stop works' },
          { id: 'D6', text: 'Hoist: pre-start sheets filled in, annual inspection tag current, frame and welds sound' },
          { id: 'D7', text: 'Air compressor / receiver: guards on, no air leaks, tank drained, airline reeled up (not across walkways), compressed air sign posted' },
          { id: 'D8', text: 'Battery charging area clear of cardboard and combustibles; chargers on a non-combustible surface; no swollen or damaged batteries' },
          { id: 'D9', text: 'Oxy-acetylene cylinders upright, chained, clear of the grinder / spark area',
            sub: 'Flashback arrestors on both lines at regulator and torch, tagged within 12 months (AS 4839)' },
          { id: 'D10', text: 'LPG cylinders outside in a caged, ventilated spot, upright and secured, at least 3 m from ignition sources, doors and drains',
            sub: 'None under the charging bench or in the flammables cupboard (Diamond, 2024-25)' },
          { id: 'D11', text: 'Benches, shelving and floor clear: no trip hazards, no paper or cardboard near machines or fuel' },
          { id: 'D12', text: 'Knapsack and hand sprayers: hoses, handles, wands and fittings tight, no leaks or cracks',
            sub: 'Near miss 19 Oct 2026: a knapsack hose came off the handle under pressure' }
        ] }
      ] },

      { id: 'E', title: 'Flammables, chemicals, fuel & wash-down bay', short: 'Chemicals & fuel', blocks: [
        { type: 'items', items: [
          { id: 'E1', text: 'Flammables cabinet: aerosols and 2-stroke / fuels inside, doors closed, nothing on top' },
          { id: 'E2', text: 'No aerosols or fuels left in the workshop, near switchboards, heaters or the grinder' },
          { id: 'E3', text: 'Fuel cans bunged, no funnels left in, stored in the cabinet or designated area' },
          { id: 'E4', text: 'Chemical sheds: stored by class and segregated per the SDS; heavy containers low; nothing above shoulder height',
            photo: 'the chemical shed shelves' },
          { id: 'E5', text: 'All chemicals on bunding or in tubs; IBCs on bunded pallets or drip trays; drum taps have catch trays' },
          { id: 'E6', text: 'All containers original-labelled; decanted / spray bottles labelled with contents (no Texta)' },
          { id: 'E7', text: 'SDS folders cover every product, every SDS less than 5 years old',
            sub: 'Emergency plan: on the bench in the maintenance shed outside the lunchroom, and in the small office by the locker room' },
          { id: 'E8', text: 'Schedule 7 products locked away' },
          { id: 'E9', text: 'Spill kits at chemical shed, mixing area and fuel bay: present, full, sealed, not used as a bin' },
          { id: 'E10', text: 'Eyewash / shower: signed, access clear, dust covers on, weekly flush recorded (AS 4775)',
            sub: 'Supplied by potable mains water, not the 200 L blue drum (open item from the RCW 2026 audit)' },
          { id: 'E11', text: 'PPE store: respirators clean and sealed, cartridges in date; gloves, goggles, coveralls stocked' },
          { id: 'E12', text: 'Empty chemical containers triple-rinsed, lids off, stored for collection (drumMUSTER or supplier return)' },
          { id: 'E13', text: 'Fuel bay (1000 L diesel / 1000 L unleaded): no leaks or spills, hoses and nozzles intact, tanks undamaged; nothing combustible (pallets, leaves) in the bund; bollards painted and visible',
            photo: 'the fuel bay and bund' },
          { id: 'E14', text: 'Fuel emergency stop (mushroom button) identified and signed; STOP ENGINE and NO SMOKING signs in place' },
          { id: 'E15', text: 'Wash-down bay: interceptor pits not full or overflowing, grates clear, runoff contained' },
          { id: 'E16', text: 'Hazardous substances / dangerous goods register kept at the chemical shed and up to date' }
        ] }
      ] },

      { id: 'F', title: 'Plant, machinery & storage', short: 'Plant', blocks: [
        { type: 'items', items: [
          { id: 'F1', text: 'Any defective plant has an OUT OF SERVICE tag filled in (who, date, fault) and the key removed' },
          { id: 'F2', text: 'PTO shafts and guards in place on tractors and attachments' },
          { id: 'F3', text: 'Keys not left in plant parked outside the compound; buckets lowered flat; plant parked clear of walkways' },
          { id: 'F4', text: 'Pre-start checks done in TurfDog for plant used this month' },
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
          { id: 'G1', text: 'Noticeboard: “If You Are Injured at Work” poster with a current contact',
            sub: 'The HR Manager named on older posters has left. Check the name and number are current.' },
          { id: 'G10', text: 'Noticeboard: H&S policy, issue resolution, NER (staff rep) names for course maintenance and the latest WHS committee minutes',
            sub: 'The Amstel Group uses NERs (nominated employee representatives), not HSRs' },
          { id: 'G2', text: 'No alcohol in the staff fridge' },
          { id: 'G3', text: 'Toilets clean; soap and paper towel stocked; urinal privacy screen in place' },
          { id: 'G4', text: 'Kitchen: a separate handwash basin with soap and paper towel (not used for dishes); fridge and benches clean; food dated' },
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
          { id: 'H3', text: 'Shrubs and trees trimmed back from walkways, shed walls, exit doors and hydrants (1 m clear)' },
          { id: 'H4', text: 'Speed limit, shared zone and “Beware of Pedestrians” signs and bollards in place and visible' },
          { id: 'H5', text: 'Work areas in the car park separated from the public (bollards / cones); orange hi-vis worn there' },
          { id: 'H6', text: 'HAZCHEM sign at the gate; “No Unauthorised Entry” sign on the fence' },
          { id: 'H7', text: 'Contractor / visitor sign-in register at the shed is being used', sub: 'Check this month’s entries' },
          { id: 'H8', text: 'Bins: lids closed, not overflowing' },
          { id: 'H9', text: 'Safety signs (PPE, hearing, chemical, corrosive) in place and legible' },
          { id: 'H10', text: 'Maintenance driveway (emergency vehicle access): no potholes, overhanging trees cut back, nothing parked across it' },
          { id: 'H11', text: 'Visitor car park: surface compacted, wheel stops in place', sub: 'Diamond rated this High in 2024-25' }
        ] }
      ] },

      { id: 'I', title: 'Service & test dates', short: 'Service dates', blocks: [
        { type: 'service',
          note: 'Read the date off the tag, sticker or service record, not today’s date. Anything overdue becomes a defect automatically. No tag or record? Tap “Can’t find the date”. Booked in? Add a note.',
          items: [
            { id: 'I1', text: 'Fire extinguishers & blanket', freq: '6-monthly (AS 1851)', by: 'Fire contractor', hint: 'Date punched on the extinguisher tag' },
            { id: 'I2', text: 'Exit & emergency lighting', freq: '6-monthly discharge test (AS/NZS 2293.2)', by: 'Electrician' },
            { id: 'I3', text: 'Electrical test & tag', freq: 'Per tag (AS/NZS 3760)', by: 'Electrician' },
            { id: 'I4', text: 'Switchboard thermal imaging', freq: 'Annual', by: 'Electrician' },
            { id: 'I5', text: 'Workshop hoist inspection', freq: 'Annual, February', by: 'Hoist inspector (Alljacks & Hoists / Fink: confirm)' },
            { id: 'I6', text: 'Oxy-acetylene flashback arrestors', freq: '12-monthly test (AS 4839), not the daily check', by: 'Competent person' },
            { id: 'I7', text: 'First aid kits: full check and restock', freq: 'Quarterly and after any use', by: 'First aid officer' },
            { id: 'I8', text: 'Backflow prevention valve', freq: 'Annual', by: 'Plumber' },
            { id: 'I9', text: 'Fire hydrant flow test', freq: 'Annual', by: 'Fire contractor' },
            { id: 'I10', text: 'Evacuation exercise', freq: 'Every 6 months; full evacuation once a year (emergency plan s7)', by: 'Fire wardens' },
            { id: 'I11', text: 'Plant-mounted fire extinguishers', freq: '6-monthly (AS 1851)', by: 'Fire contractor' }
          ] }
      ] }
    ]
  },

  clubhouse: {
    id: 'clubhouse',
    name: 'Clubhouse & driving range',
    sub: 'Clubhouse, kitchens, function rooms, pro shop, golf ops, cart store, driving range, car park and outside',
    version: '2026.10-1',
    everyDays: 31,
    sections: [

      { id: 'A', title: 'Defibrillators & first aid', short: 'AED & first aid', where: 'Bottom of the stairwell and the downstairs kitchen, upstairs function rooms, pro shop', blocks: [
        { type: 'assets', id: 'aed', title: 'Defibrillators (AED)',
          note: 'Pads and battery must not expire before next month’s check. Diamond’s last record (Jun 2025): kitchen / stairwell AED 18 Sep 2026 (now passed) and pro shop AED 15 Nov 2026. The 7 Oct 2026 meeting said replacement pads are needed. Can’t find a date? Tap “Can’t find the date”.',
          photo: 'the AED with its ready light showing, and the pad packet use-by date',
          addable: true,
          assets: [
            { id: 'stair', name: 'Stairwell / kitchen AED', where: 'Bottom of the stairwell by the downstairs kitchen' },
            { id: 'proshop', name: 'Pro shop AED', where: 'Pro shop' }
          ],
          checks: [
            { id: 'status', text: 'Status light shows ready', sub: 'No warning symbol, red light or beeping' },
            { id: 'spare', text: 'Spare set of pads present' },
            { id: 'kit', text: 'Rescue kit complete', sub: 'Gloves, CPR face shield, scissors, razor, towel' },
            { id: 'sign', text: 'AED sign above it, easy to see, nothing in front of it', sub: 'RCW 2026: the stairwell and kitchen AED and kits need clear signs' }
          ],
          dates: [
            { id: 'pads', label: 'Pads expiry', hint: 'Use-by date printed on the sealed pad packet.' },
            { id: 'battery', label: 'Battery expiry', hint: 'Install-by / expiry date on the battery label, or shown after the self-test.' }
          ] },
        { type: 'assets', id: 'fak', title: 'First aid kits',
          note: 'Every kit needs a contents list inside it: that list is what you check against. No list = answer No and say so. Diamond (Jun 2025) found the kitchen kit run down. Restock anything used straight away.',
          addable: true,
          assets: [
            { id: 'stair', name: 'Stairwell kit', where: 'Bottom of the stairwell' },
            { id: 'kitchen', name: 'Kitchen kit', where: 'Downstairs kitchen' },
            { id: 'function', name: 'Function rooms kit', where: 'Upstairs' },
            { id: 'proshop', name: 'Pro shop kit', where: 'Pro shop' }
          ],
          checks: [
            { id: 'sign', text: 'Green first aid sign above it, easy to find', sub: 'Neil (2025): first aid sign missing in the kitchen' },
            { id: 'contents', text: 'Contents list inside the kit, and everything on it is there', photo: 'the open kit' },
            { id: 'dates', text: 'All items in date; burns dressings in the kitchen kits' },
            { id: 'clean', text: 'Kit clean and dry, not used to store anything else' }
          ] },
        { type: 'items', items: [
          { id: 'A1', text: 'Any AED or first aid kit taken out or used since the last check was reported (incident report in Tanda) and restocked',
            sub: 'WHS committee, Sep 2026: report it whenever a kit or defib is taken out, whether it was used or not' },
          { id: 'A2', text: 'DRSABCD chart displayed at each AED and first aid point' },
          { id: 'A3', text: 'First aider names (with certificate expiry) posted at each first aid point and on the staff noticeboard',
            sub: 'RCW 2026 and Diamond (Mar 2025) found none posted' },
          { id: 'A4', text: 'First aid / injury register displayed with the stairwell kit', sub: 'RCW 2026' },
          { id: 'A5', text: 'Emergency numbers (000), the site address (825 Cranbourne-Frankston Rd) and nearest hospital posted at reception and the pro shop counter' }
        ] }
      ] },

      { id: 'B', title: 'Fire equipment', short: 'Fire', where: 'Walk the whole building, then the hydrants and booster outside', blocks: [
        { type: 'assets', id: 'ext', title: 'Fire extinguishers',
          note: 'Numbers are from the fire contractor’s tags (Diamond, Jun 2025) and the list isn’t complete: add any extinguisher you find that isn’t here, with its tag number. Mounted = handle no higher than 1.2 m, sign above it (AS 2444).',
          typeField: 'Type / size on label',
          addable: true, addName: 'e.g. #6 extinguisher',
          assets: [
            { id: 'e1', name: '#1 Golf buggy bag storage', type: 'ABE 4.5 kg' },
            { id: 'e2', name: '#2 Pro shop kitchen', type: 'ABE 4.5 kg' },
            { id: 'e3', name: '#3 Rear offices of the pro shop', type: 'CO2 5 kg' },
            { id: 'e4', name: '#4 Rear pro shop kitchen', type: 'ABE 2.5 kg' },
            { id: 'e9', name: '#9 Corridor outside the function rooms', type: 'ABE 2.5 kg' },
            { id: 'e11', name: '#11 Function room kitchen', type: 'ABE 4.5 kg' },
            { id: 'e12', name: '#12 Wet chemical', where: 'Kitchen, by the fryers', type: 'Wet chemical 7 L' },
            { id: 'admin', name: 'Admin offices', where: 'Needs a location sign (RCW 2026)', type: 'CO2' },
            { id: 'boh', name: 'Back of house', where: 'Hang it and sign it (RCW 2026)', type: 'ABE 4.5 kg' },
            { id: 'golfops', name: 'Golf ops', where: 'Hang it and sign it (RCW 2026)', type: 'ABE 4.5 kg' }
          ],
          checks: [
            { id: 'gauge', text: 'Gauge in the green; pin and tamper seal intact' },
            { id: 'tag', text: 'Service tag within the last 6 months' },
            { id: 'mount', text: 'Hung on its bracket at the right height, with a sign above it' },
            { id: 'access', text: 'Clear access, nothing in front' }
          ] },
        { type: 'assets', id: 'blanket', title: 'Fire blankets',
          addable: true,
          assets: [
            { id: 'stair', name: 'Base of the stairwell' },
            { id: 'kitchen', name: 'Downstairs kitchen' },
            { id: 'function', name: 'Function room / upstairs kitchen', where: 'RCW 2026: install below its location sign' },
            { id: 'proshop', name: 'Pro shop kitchen' }
          ],
          checks: [
            { id: 'holder', text: 'In its holder, both tabs hanging down, sign at or just above it' },
            { id: 'access', text: 'Clear access, nothing in front' },
            { id: 'tag', text: 'Service tag current' }
          ] },
        { type: 'assets', id: 'reel', title: 'Fire hose reels',
          note: 'Numbers from the fire contractor’s tags. Add any reel that isn’t listed.',
          addable: true,
          assets: [
            { id: 'r1', name: '#1 Driving range tee-off', where: 'RCW 2026: needs a hose reel sign' },
            { id: 'r2', name: '#2 Golf buggy bag storage' },
            { id: 'r3', name: '#3 Reception', where: 'Inside the front entrance at the car park' },
            { id: 'r8', name: '#8 Function room waiting area' },
            { id: 'r15', name: '#15 Between the driving range and the sports bar' },
            { id: 'golfops', name: 'Golf ops', where: 'By the door. RCW 2026: needs a sign' }
          ],
          checks: [
            { id: 'sign', text: 'Hose reel sign above it' },
            { id: 'cond', text: 'Hose neatly rolled, nozzle on, no leaks' },
            { id: 'access', text: 'Clear access (1 m), not used for storage' }
          ] },
        { type: 'assets', id: 'hyd', title: 'Hydrants & booster (monthly check)',
          note: 'An essential safety measure inspected every month (Diamond used to do it). Diamond (Jan / Feb 2025) found both standpipes overgrown.',
          assets: [
            { id: 'h1', name: 'Standpipe #1', where: 'Next to the professional car park' },
            { id: 'h2', name: 'Standpipe #2', where: 'Walkway to the driving range' },
            { id: 'boost', name: 'Booster cabinet', where: 'Next to the driving range car park' }
          ],
          checks: [
            { id: 'clear', text: '1 m clear of shrubs, cars and stock; visible from the driveway' },
            { id: 'cond', text: 'Valves, caps and fittings in place, no leaks or damage' },
            { id: 'secure', text: 'Signed; booster cabinet locked and undamaged' }
          ] },
        { type: 'items', items: [
          { id: 'B1', text: 'Smoke alarms: press the test button on at least 5 around the building (a different 5 each month); each one sounds', noNA: true,
            sub: 'Ranfurlie has no fire panel, so these alarms are the only automatic warning. Say in the defect note which ones failed.' },
          { id: 'B2', text: 'Golf cart store and charging: chargers on a non-combustible surface, leads undamaged, no swollen or damaged batteries, nothing stored around the chargers' },
          { id: 'B3', text: 'Lithium-ion fire extinguisher installed at the golf cart store', noNA: true,
            sub: 'RCW 2026 priority 1 item (the carts are lithium-ion). Answer No until it’s in.' },
          { id: 'B4', text: 'Nothing stacked in front of or hanging on any fire equipment, including in the dry store' }
        ] }
      ] },

      { id: 'C', title: 'Exits, emergency lighting & evacuation', short: 'Exits', where: 'Every exit door, the lifts, and the assembly points outside', blocks: [
        { type: 'items', items: [
          { id: 'C1', text: 'All exit doors open from the inside without a key; nothing chained, locked or stacked against them', noNA: true },
          { id: 'C2', text: 'Exit signs illuminated across the building' },
          { id: 'C3', text: 'Emergency lights: charging indicator on, fittings undamaged' }
        ] },
        { type: 'assets', id: 'evac', title: 'Evacuation diagrams',
          note: 'Neil (2025): no map in the members lounge or pro shop. RCW 2026 wants an issue date on each, the right orientation, and the “fire alarm panel” wording removed (there is no panel).',
          addable: true,
          assets: [
            { id: 'foyer', name: 'Entry foyer / reception' },
            { id: 'spike', name: 'Sports (Spike) bar' },
            { id: 'lounge', name: 'Members lounge' },
            { id: 'proshop', name: 'Pro shop' },
            { id: 'buggy', name: 'Golf buggy storage' },
            { id: 'function', name: 'Function rooms (upstairs)' },
            { id: 'kitchen', name: 'Downstairs kitchen' }
          ],
          checks: [
            { id: 'there', text: 'Diagram in place and readable, with an issue date' },
            { id: 'right', text: '“You are here”, the way it faces and the assembly point are all correct' }
          ] },
        { type: 'items', items: [
          { id: 'C4', text: 'Assembly point signs in place, visible and clear of parked cars', photo: 'each assembly point sign',
            sub: 'The emergency plan versions name different spots (Presidents parking area towards the road, near the first tee, by the range near the main gate). If the signs don’t match the evacuation diagrams, answer No and say where the signs are.' },
          { id: 'C5', text: 'Paths of travel to exits, exit discharge and stairways clear; stair treads non-slip, step edges visible; handrails and balustrades firm',
            months: [1, 4, 7, 10], sub: 'Essential safety measure every 3 months (Jan, Apr, Jul, Oct). Diamond used to do this one.' },
          { id: 'C6', text: 'Function room passenger lift: goes floor to floor, alarm / phone button works, light on, service sticker current',
            sub: 'The Savaria service contract expired Nov 2025. Lifts are not used in a fire or smoke emergency.' },
          { id: 'C7', text: 'Kitchen service lift: light working, doors and gate close properly, no fault signs', sub: 'Two entrapments in 2024' },
          { id: 'C8', text: 'Fire warden names and photos on the staff noticeboard; warden caps / vests at the warden point' },
          { id: 'C9', text: 'Monthly communications check: megaphone / siren works and the warden phones / radios work', noNA: true,
            sub: 'Emergency plan section 6.2. The amplifier was away for repair (7 Oct 2026).' },
          { id: 'C10', text: 'External and car park lighting working', sub: 'Check at dusk or on an evening shift' }
        ] }
      ] },

      { id: 'D', title: 'Kitchens, gas & back of house', short: 'Kitchens', where: 'Downstairs kitchen, function room kitchen, pro shop kitchen, cool rooms, dry store, cleaners’ store, loading dock, server room', blocks: [
        { type: 'items', items: [
          { id: 'D1', text: 'Gas isolation valve signed and can be reached straight away (no locked door or stock in front of it)', noNA: true,
            photo: 'the gas isolation valve and its sign',
            sub: 'Open High risk since 2023 (the door in front of the valve). 7 Oct 2026: the internal valve is behind the kitchen door; the external isolation point still needs checking.' },
          { id: 'D2', text: 'Gas cylinders (CO2 / beer gas, LPG): upright, chained or hooped, current danger sign, no trip hazard around them',
            sub: 'RCW 2026: install cylinder hoops, remove the trip hazard, update the CO2 sign' },
          { id: 'D3', text: 'Fryers, flat tops and ovens: no grease build-up, nothing combustible on or beside them; fire blanket and wet chemical extinguisher within reach' },
          { id: 'D4', text: 'Canopy filters in place and clean; no grease dripping from the canopy' },
          { id: 'D5', text: 'Cool rooms and freezer rooms: inside door release works and is easy to find; floor dry, no ice; light works', noNA: true },
          { id: 'D6', text: 'Cool rooms, freezers and fridges: door seals intact, no mould, nothing broken',
            months: [1, 4, 7, 10], sub: 'Refrigerated chambers are an essential safety measure every 3 months. RCW 2026 found mould in the upstairs cool room and freezer.' },
          { id: 'D7', text: 'Chemicals in kitchens, bars and the cleaners’ store: original labels, on trays or bunding, off the floor, no unlabelled spray bottles',
            photo: 'the cleaners’ chemical store' },
          { id: 'D8', text: 'SDS for every chemical, each less than 5 years old: in the folder outside the chemical store in the loading area, and at the pro shop',
            sub: 'Emergency plan location. The pro shop SDS location is still blank in the plan. RCW 2026: SDS needed for aerosols, Raid, metho and sunscreen.' },
          { id: 'D9', text: 'Spill kit present and stocked near the chemical store / loading area' },
          { id: 'D10', text: 'Kitchen and back-of-house electrics: no damaged plugs, leads or exposed wiring; damaged appliances tagged OUT OF SERVICE',
            sub: 'Near miss Nov 2025: a meat slicer plug exploded. RCW 2026: exposed wiring upstairs; chest freezer switch.' },
          { id: 'D11', text: 'Server room switchboard and Static Var Generator: 1 m clear in front, no rubbish or stock stored there', noNA: true, sub: 'RCW 2026 priority 1' },
          { id: 'D12', text: 'Dry store and cool rooms: heavy items low, nothing above shoulder height, stock off the floor; safety step there and in use' },
          { id: 'D13', text: 'Handwash basins: hot water, soap and paper towel stocked', sub: 'RCW 2026 priority 1' },
          { id: 'D14', text: 'Floors in kitchens, bars and back of house: no grease, water or ice; mats flat; mops and brooms hung up' },
          { id: 'D15', text: 'Loading dock and kitchen door: closer works (the door doesn’t slam); dock area clear', sub: 'Crush risk on the kitchen door (risk register)' }
        ] }
      ] },

      { id: 'E', title: 'Driving range & golf operations', short: 'Range', where: 'Range bays, premium room, golf academy room, ball room, cart store, golf ops workshop', blocks: [
        { type: 'items', items: [
          { id: 'E1', text: 'Yellow safety line clearly painted along every bay', photo: 'the yellow line along the bays',
            sub: 'Two more serious patron injuries after crossing the line (Jun 2026 WHS minutes)' },
          { id: 'E2', text: '“Stay behind the yellow line” signs at each bay, readable' },
          { id: 'E3', text: 'Range netting, poles, guy wires and side barriers: no tears, sagging, leaning poles or loose wires', photo: 'the netting and poles',
            sub: 'Check especially after wind. Oct 2025: the netting nearly came down. Balls have reached Cranbourne-Frankston Rd and the car park.' },
          { id: 'E4', text: 'Bays: dividers, mats, tee holders and bar stools in good condition; nothing broken or loose' },
          { id: 'E5', text: 'Premium room and premium bays: glass and doors not cracked; ball-strike protection in place' },
          { id: 'E6', text: 'Golf academy (Trackman) room: screens and netting intact, equipment protected from ball strikes', sub: 'Near miss 6 Oct 2026: a patron hit the Trackman' },
          { id: 'E7', text: 'Ball dispenser / ball washer room: guards on; “isolate before clearing a jam” sign posted; floor clear of balls; walkway to the washer clear',
            sub: 'Dec 2025: hand cut unclogging the ball machine' },
          { id: 'E8', text: 'Any ladder in the range shed is an industrial 150 kg ladder in good condition (no domestic ladders)', sub: 'Diamond rated a domestic ladder there High (Mar 2025)' },
          { id: 'E9', text: 'No fuel stored or decanted in the ball room or pro shop (carts are filled at the maintenance shed)', noNA: true,
            sub: 'Oct 2025: petrol in an employee’s eye while filling a cart in the ball dispenser room' },
          { id: 'E10', text: 'Range ball picker / cart: cage intact, cart in good condition, pre-start done' },
          { id: 'E11', text: 'Range rules and hours signs up; “range closed” sign and gate / barrier in place for when it’s shut' },
          { id: 'E12', text: 'Cart store: roller door and its guides undamaged and working; carts parked clear of walkways' },
          { id: 'E13', text: 'Golf ops workshop: grinder guard on; “Hearing and eye protection must be worn” sign up; floor mat and timber batten trip hazard gone; flammables (fuel, Araldite) in a cabinet',
            sub: 'RCW 2026 golf ops items' }
        ] }
      ] },

      { id: 'F', title: 'Public areas, offices & amenities', short: 'Public & offices', where: 'Foyer, bars, members lounge, function rooms, balcony and alfresco, toilets, offices, staff room', blocks: [
        { type: 'items', items: [
          { id: 'F1', text: 'Floors, stairs and ramps in public areas: no trip hazards, loose carpet or wet floors without a sign' },
          { id: 'F2', text: 'Stairs to the pro shop, members lounge and function rooms: handrails firm, step edges visible, well lit',
            sub: 'Slips on the pro shop stairs (2023) and the kitchen stairs (Oct 2026)' },
          { id: 'F3', text: 'Toilets: clean, floors dry, soap and paper towel stocked, sanitary bins in the female toilets, doors signed' },
          { id: 'F4', text: 'Balcony and alfresco: umbrellas furled or secured, furniture sound; A-frame signs brought in on windy days',
            sub: 'An umbrella blew 20 m off the balcony onto the range (Dec 2023)' },
          { id: 'F5', text: 'Offices: no trip hazards, cables tidy, items off the floor, power boards surge-protected and not daisy-chained',
            sub: 'RCW 2026 priority 1 (admin offices, golf ops)' },
          { id: 'F6', text: 'Test & tag: spot-check 10 leads and appliances across the function rooms, offices and pro shop; all tags in date',
            sub: 'RCW 2026: tags were overdue (due Jan 2026)' },
          { id: 'F7', text: 'Ceilings, air-con vents and cassettes: clean, no leaks, water stains or mould' },
          { id: 'F8', text: 'Staff noticeboard: “If You Are Injured at Work” poster with a current contact',
            sub: 'The HR Manager named on older posters has left. Check the name and number are current.' },
          { id: 'F9', text: 'Staff noticeboard: hazard and incident report forms available, NER (staff rep) names for hospitality and golf ops, latest WHS committee minutes' },
          { id: 'F10', text: 'Workplace violence / aggression poster up in the sports bar, members lounge and at the driving range', sub: 'Neil’s 2025 signage review found none there' },
          { id: 'F11', text: 'Smoking: no butts outside the designated area, butt bins only there, no-smoking signs at the entrances',
            sub: 'A bin by the front door smouldered from a cigarette butt (Oct 2024)' },
          { id: 'F12', text: 'No signs of pests (droppings, damage) in kitchens, stores or the upstairs cupboards' }
        ] }
      ] },

      { id: 'G', title: 'Car park, entrance & outside', short: 'Outside', where: 'Car parks, portico, front gate, loading area, paths and gardens', blocks: [
        { type: 'items', items: [
          { id: 'G1', text: 'Car park entry: shared zone / “Beware of pedestrians” sign up; speed humps marked and signed', sub: 'RCW 2026' },
          { id: 'G2', text: 'Car park, paths and steps: no potholes, lifted concrete lips or loose pavers',
            sub: 'Known spots: the concrete lip outside the pro shop; the top step of the members putting green stairs' },
          { id: 'G3', text: 'Walkways clear of leaves, limbs and debris; trees and shrubs cut back from paths and buildings',
            sub: 'External areas clear of debris is an essential safety measure every 3 months; this monthly check is the record' },
          { id: 'G4', text: 'Portico 2.5 m height-limit sign visible', sub: 'A truck hit the portico in Jan 2024' },
          { id: 'G5', text: 'HAZCHEM sign at the front gate / entrance', sub: 'RCW 2026' },
          { id: 'G6', text: 'Loading area clear (nothing blocking doors); bins lidded and not overflowing' },
          { id: 'G7', text: 'Contractor / visitor sign-in book at reception in place and being used', noNA: true,
            sub: 'June 2026 WHS paper: the clubhouse and range had no contractor sign-in. Answer No until there is one.' },
          { id: 'G8', text: 'Range boundary fence and gates secure; no gaps where people can walk onto the range' }
        ] }
      ] },

      { id: 'H', title: 'Service & test dates', short: 'Service dates', blocks: [
        { type: 'service',
          note: 'Read the date off the tag, sticker or service record, not today’s date. Anything overdue becomes a defect automatically. No tag or record? Tap “Can’t find the date” (Diamond often found records missing from the AESM folder). Booked in? Add a note.',
          items: [
            { id: 'H1', text: 'Fire extinguishers & fire blankets', freq: '6-monthly (May, Nov)', by: 'CFA 1300 363 661', hint: 'Date punched on the tag' },
            { id: 'H2', text: 'Fire hose reels', freq: '6-monthly, flow test yearly', by: 'CFA 1300 363 661' },
            { id: 'H3', text: 'Hydrants & booster', freq: '6-monthly service, flow test yearly (May)', by: 'DFEM' },
            { id: 'H4', text: 'Exit & emergency lighting', freq: '6-monthly discharge test', by: 'Lightspeed 0430 155 596' },
            { id: 'H5', text: 'Electrical test & tag', freq: 'Per tag (AS/NZS 3760)', by: 'Auscontrol' },
            { id: 'H6', text: 'Switchboard inspection', freq: 'Yearly (Feb)', by: 'Auscontrol, Troy Fabricato 0427 749 995' },
            { id: 'H7', text: 'Passenger lift service', freq: 'Yearly (contract expired Nov 2025)', by: 'Savaria 1300 736 402' },
            { id: 'H8', text: 'Kitchen canopy & filters deep clean', freq: 'Quarterly', by: 'Kex Commercial Services', hint: 'Last-clean sticker on the canopy' },
            { id: 'H9', text: 'Grease trap pump-out', freq: '6-monthly', by: 'Premier Waste 1300 219 001' },
            { id: 'H10', text: 'Air-conditioning / mechanical ventilation', freq: 'Quarterly (Jan, Apr, Jul, Oct)', by: 'Sea Breeze Industries' },
            { id: 'H11', text: 'Backflow prevention test', freq: 'Yearly (Oct)', by: 'Tiemans Plumbing 0408 300 899' },
            { id: 'H12', text: 'Gas shut-off valve & warm water system', freq: 'Yearly (Dec)', by: 'Mark Blake Plumbing 0418 343 342' },
            { id: 'H13', text: 'First aid kits restocked', freq: 'Quarterly', by: 'Rentokil Initial 9944 3300' },
            { id: 'H14', text: 'Smoke alarm batteries', freq: 'Yearly; alarms replaced at 10 years', by: 'Electrician' },
            { id: 'H15', text: 'Evacuation exercise', freq: 'Every 6 months; full evacuation once a year (emergency plan s7)', by: 'Chief warden' },
            { id: 'H16', text: 'Emergency plan review', freq: 'Every 6 months (emergency plan s8)', by: 'WHS committee' }
          ] }
      ] }
    ]
  }
};
