// Static reference data for the demo: salons, staff, menus, vendors, courses.
// All businesses and people here are fictional.

export const FEMALE = ['Priya', 'Divya', 'Anitha', 'Kavya', 'Lakshmi', 'Meena', 'Sowmya', 'Pooja', 'Shalini', 'Deepa', 'Revathi', 'Nisha', 'Swathi', 'Harini', 'Janani', 'Keerthana', 'Aishwarya', 'Bhavani', 'Gayathri', 'Ramya', 'Sneha', 'Anjali', 'Neha', 'Ritu', 'Shruti', 'Tanvi', 'Ananya', 'Ishita', 'Zoya', 'Fatima', 'Sana', 'Ayesha', 'Mary', 'Grace', 'Nandini', 'Vidya', 'Pavithra', 'Sindhu', 'Roshni', 'Madhu'];
export const MALE = ['Arjun', 'Karthik', 'Rahul', 'Vikram', 'Suresh', 'Ramesh', 'Senthil', 'Manoj', 'Naveen', 'Rohit', 'Kiran', 'Aditya', 'Vignesh', 'Prakash', 'Dinesh', 'Salman', 'Imran', 'Farhan', 'Joseph', 'David', 'Ganesh', 'Hari', 'Sanjay', 'Ajay', 'Varun', 'Siddharth', 'Gautham', 'Ashwin', 'Bala', 'Mohan', 'Raghav', 'Akash', 'Nikhil', 'Abdul', 'Kevin', 'Pranav', 'Yash', 'Tarun', 'Sai', 'Vijay'];
export const LAST = ['Kumar', 'Sharma', 'Iyer', 'Reddy', 'Nair', 'Rao', 'Krishnan', 'Menon', 'Pillai', 'Shetty', 'Gowda', 'Naidu', 'Patel', 'Verma', 'Singh', 'Khan', 'Shaikh', 'Fernandes', 'Joseph', 'Raman', 'Subramanian', 'Venkatesh', 'Balaji', 'Murthy', 'Hegde', 'Das', 'Bose', 'Gupta', 'Jain', 'Mehta'];

// category keys used for stylist skills
export const MENU = {
  unisex: [
    { name: 'Haircut — Women', category: 'Hair', price: 650, dur: 45, cycle: 45, gender: 'women', tags: 'haircut,layers,women haircut', recipe: [] },
    { name: 'Haircut — Men', category: 'Men', price: 350, dur: 30, cycle: 28, gender: 'men', tags: 'haircut,fade,men haircut', recipe: [] },
    { name: 'Beard Trim & Shape', category: 'Men', price: 200, dur: 20, cycle: 14, gender: 'men', tags: 'beard,beard trim', recipe: [] },
    { name: 'Head Massage', category: 'Men', price: 300, dur: 20, cycle: null, gender: 'unisex', tags: 'massage,relax', recipe: [] },
    { name: "Men's Hair Colour", category: 'Men', price: 900, dur: 45, cycle: 30, gender: 'men', tags: 'colour,grey coverage', recipe: [['Hair Colour Tube 60g', 0.35], ['Developer 1L', 0.03]] },
    { name: 'Blow-dry & Styling', category: 'Hair', price: 700, dur: 40, cycle: null, gender: 'women', tags: 'blowdry,styling,party', recipe: [] },
    { name: 'Hair Spa', category: 'Treatments', price: 1200, dur: 60, cycle: 30, gender: 'unisex', tags: 'hair spa,dandruff,frizz', recipe: [['Hair Spa Cream 500g', 0.04]] },
    { name: 'Curly Hair Cut & Care', category: 'Hair', price: 1400, dur: 75, cycle: 60, gender: 'unisex', tags: 'curly hair,curls,wavy', recipe: [] },
    { name: 'Root Touch-up', category: 'Colour', price: 1500, dur: 75, cycle: 35, gender: 'women', tags: 'colour,grey coverage,root touch up', recipe: [['Hair Colour Tube 60g', 0.6], ['Developer 1L', 0.04]] },
    { name: 'Global Hair Colour', category: 'Colour', price: 3500, dur: 120, cycle: 60, gender: 'unisex', tags: 'colour,global colour', recipe: [['Hair Colour Tube 60g', 1.2], ['Developer 1L', 0.08]] },
    { name: 'Balayage / Highlights', category: 'Colour', price: 5500, dur: 180, cycle: 90, gender: 'women', tags: 'balayage,highlights,colour', recipe: [['Lightener 500g', 0.06], ['Hair Colour Tube 60g', 0.6], ['Developer 1L', 0.06]] },
    { name: 'Keratin Treatment', category: 'Treatments', price: 6500, dur: 180, cycle: 120, gender: 'unisex', tags: 'keratin,frizz,smoothening', recipe: [['Keratin Smooth Kit 1L', 0.08]] },
    { name: 'Classic Facial', category: 'Skin', price: 1500, dur: 60, cycle: 30, gender: 'unisex', tags: 'facial,glow', recipe: [['Facial Kit (pack of 5)', 0.15]] },
    { name: 'Clean-up', category: 'Skin', price: 800, dur: 40, cycle: 21, gender: 'unisex', tags: 'cleanup,skin', recipe: [['Facial Kit (pack of 5)', 0.1]] },
    { name: 'D-Tan Pack', category: 'Skin', price: 600, dur: 30, cycle: null, gender: 'unisex', tags: 'detan,tan removal', recipe: [] },
    { name: 'Eyebrow Threading', category: 'Waxing', price: 80, dur: 10, cycle: 18, gender: 'women', tags: 'threading,eyebrows', recipe: [] },
    { name: 'Full Arms Waxing', category: 'Waxing', price: 450, dur: 30, cycle: 28, gender: 'women', tags: 'waxing,rica', recipe: [['Liposoluble Wax 800ml', 0.08]] },
    { name: 'Full Legs Waxing', category: 'Waxing', price: 650, dur: 40, cycle: 28, gender: 'women', tags: 'waxing,rica', recipe: [['Liposoluble Wax 800ml', 0.12]] },
    { name: 'Manicure', category: 'Nails', price: 600, dur: 40, cycle: 21, gender: 'unisex', tags: 'manicure,nails', recipe: [] },
    { name: 'Pedicure', category: 'Nails', price: 800, dur: 50, cycle: 21, gender: 'unisex', tags: 'pedicure,feet', recipe: [] },
    { name: 'Party Makeup', category: 'Makeup', price: 3500, dur: 90, cycle: null, gender: 'women', tags: 'party,makeup,engagement', recipe: [] },
    { name: 'Pre-bridal Package', category: 'Makeup', price: 8000, dur: 150, cycle: null, gender: 'women', tags: 'bridal,pre-bridal,wedding', recipe: [['Facial Kit (pack of 5)', 0.2]] },
    { name: 'Bridal Makeup', category: 'Makeup', price: 15000, dur: 180, cycle: null, gender: 'women', tags: 'bridal,wedding,makeup', recipe: [] },
  ],
  men: [
    { name: 'Haircut — Men', category: 'Men', price: 250, dur: 30, cycle: 25, gender: 'men', tags: 'haircut,men haircut', recipe: [] },
    { name: 'Skin Fade', category: 'Men', price: 350, dur: 40, cycle: 21, gender: 'men', tags: 'fade,skin fade,haircut', recipe: [] },
    { name: 'Beard Trim & Shape', category: 'Men', price: 150, dur: 20, cycle: 10, gender: 'men', tags: 'beard,beard trim', recipe: [] },
    { name: 'Beard Styling', category: 'Men', price: 250, dur: 25, cycle: 14, gender: 'men', tags: 'beard,beard styling', recipe: [] },
    { name: 'Hot Towel Shave', category: 'Men', price: 200, dur: 25, cycle: 7, gender: 'men', tags: 'shave,hot towel', recipe: [] },
    { name: "Men's Hair Colour", category: 'Colour', price: 700, dur: 45, cycle: 30, gender: 'men', tags: 'colour,grey coverage', recipe: [['Hair Colour Tube 60g', 0.35], ['Developer 1L', 0.03]] },
    { name: 'Head Massage', category: 'Treatments', price: 200, dur: 20, cycle: null, gender: 'men', tags: 'massage', recipe: [] },
    { name: 'Hair Spa', category: 'Treatments', price: 800, dur: 45, cycle: 30, gender: 'men', tags: 'hair spa,dandruff', recipe: [['Hair Spa Cream 500g', 0.05]] },
    { name: "Men's Facial", category: 'Skin', price: 900, dur: 45, cycle: 30, gender: 'men', tags: 'facial,men facial', recipe: [['Facial Kit (pack of 5)', 0.2]] },
    { name: 'D-Tan Pack', category: 'Skin', price: 500, dur: 30, cycle: null, gender: 'men', tags: 'detan', recipe: [] },
  ],
};

// Women-only salon uses the unisex menu filtered to women/unisex
export const WEIGHTS = {
  women: { 'Haircut — Women': 16, 'Eyebrow Threading': 22, 'Root Touch-up': 8, 'Hair Spa': 7, 'Classic Facial': 7, 'Clean-up': 7, 'Full Arms Waxing': 6, 'Full Legs Waxing': 4, Manicure: 4, Pedicure: 6, 'Global Hair Colour': 3, 'Balayage / Highlights': 2, 'Keratin Treatment': 2, 'Curly Hair Cut & Care': 2, 'Blow-dry & Styling': 3, 'Party Makeup': 1.5, 'Pre-bridal Package': 0.5, 'Bridal Makeup': 0.25, 'D-Tan Pack': 2 },
  men: { 'Haircut — Men': 45, 'Skin Fade': 15, 'Beard Trim & Shape': 25, 'Beard Styling': 6, 'Hot Towel Shave': 6, 'Head Massage': 5, "Men's Hair Colour": 7, 'Hair Spa': 4, 'D-Tan Pack': 3, "Men's Facial": 3, 'Clean-up': 3, 'Classic Facial': 2 },
};

export const BRAND = {
  name: 'GlowCraft Salons', slug: 'glowcraft', royalty_pct: 6, marketing_fee_pct: 2, hue: 300,
};

/** Salons. returnRate = chance a first-timer comes back (drives the 2nd-visit KPI). */
export const SALONS = [
  {
    key: 'gc_an', brand: true, owner: 'anand', name: 'GlowCraft Anna Nagar', area: 'Anna Nagar', city: 'Chennai', lat: 13.085, lng: 80.2101,
    address: '2nd Avenue, Anna Nagar, Chennai 600040', gender_type: 'unisex', price_level: 3, open: '09:00', close: '21:00', hue: 300, plan: 'franchise',
    women_staff: 1, home_service: 0, private_rooms: 1, gold_partner: 1, menu: 'unisex', priceX: 1.1, daily: 30, returnRate: 0.64, rebook: 0.38, retail: 0.24, discount: 0.08, noShow: 0.05,
    tagline: 'Award-winning colour and skin experts in Anna Nagar', upi: 'glowcraft.annanagar@okaxis', gst: '33AABCG1234F1Z5',
    manager: { key: 'lakshmi', name: 'Lakshmi Narayanan', gender: 'F', email: 'manager@glowcraft.in', phone: '9000000301' },
    staff: [
      { key: 'ravi', name: 'Ravi Kumar', gender: 'M', level: 'senior', title: 'Senior Colour Expert', skills: ['Hair', 'Colour', 'Treatments', 'Men'], email: 'stylist@glowcraft.in', phone: '9000000401', base: 26000, comm: 12, spec: 'Balayage, global colour, keratin', months: 30 },
      { key: 'divya', name: 'Divya S', gender: 'F', level: 'junior', title: 'Skin & Nail Artist', skills: ['Skin', 'Waxing', 'Nails'], email: 'junior@glowcraft.in', phone: '9000000402', base: 15000, comm: 10, spec: 'Threading, facials, nail art', months: 9 },
      { key: 'arjunp', name: 'Arjun Prakash', gender: 'M', level: 'senior', title: "Men's Grooming Lead", skills: ['Men', 'Hair', 'Treatments'], base: 22000, comm: 12, spec: 'Fades, beard sculpting', months: 26 },
      { key: 'fatima', name: 'Fatima Begum', gender: 'F', level: 'educator', title: 'Bridal Educator', skills: ['Makeup', 'Skin', 'Hair', 'Waxing'], base: 32000, comm: 12, spec: 'Bridal makeup, HD makeup, pre-bridal', months: 48 },
      { key: 'karthik', name: 'Karthik M', gender: 'M', level: 'junior', title: 'Hair Stylist', skills: ['Hair', 'Men', 'Treatments'], base: 15000, comm: 10, spec: 'Haircuts, hair spa', months: 7 },
      { key: 'nisha', name: 'Nisha R', gender: 'F', level: 'junior', title: 'Beauty Therapist', skills: ['Waxing', 'Nails', 'Skin'], base: 14000, comm: 10, spec: 'Rica waxing, pedicure', months: 5 },
    ],
  },
  {
    key: 'gc_vel', brand: true, owner: 'anand', name: 'GlowCraft Velachery', area: 'Velachery', city: 'Chennai', lat: 12.9815, lng: 80.218,
    address: '100 Feet Road, Velachery, Chennai 600042', gender_type: 'unisex', price_level: 3, open: '09:30', close: '21:00', hue: 285, plan: 'franchise',
    women_staff: 1, home_service: 0, private_rooms: 0, gold_partner: 1, menu: 'unisex', priceX: 1.0, daily: 22, returnRate: 0.5, rebook: 0.25, retail: 0.16, discount: 0.1, noShow: 0.07,
    tagline: 'Neighbourhood GlowCraft for families in Velachery', upi: 'glowcraft.velachery@okhdfc', gst: '33AABCG1234F2Z4',
    manager: { key: 'deepa', name: 'Deepa Venkatesh', gender: 'F', email: 'deepa@glowcraft.in', phone: '9000000303' },
    staff: [
      { key: 'senthil', name: 'Senthil Murugan', gender: 'M', level: 'senior', title: 'Senior Stylist', skills: ['Hair', 'Men', 'Colour', 'Treatments'], base: 22000, comm: 11, spec: 'Men’s cuts, colour', months: 22 },
      { key: 'priyanka', name: 'Priyanka Das', gender: 'F', level: 'senior', title: 'Skin Expert', skills: ['Skin', 'Waxing', 'Makeup'], base: 20000, comm: 11, spec: 'Facials, party makeup', months: 18 },
      { key: 'joseph', name: 'Joseph Fernandes', gender: 'M', level: 'junior', title: 'Stylist', skills: ['Hair', 'Men'], base: 15000, comm: 10, spec: 'Haircuts', months: 6 },
      { key: 'asha', name: 'Asha Nair', gender: 'F', level: 'junior', title: 'Beauty Therapist', skills: ['Waxing', 'Nails', 'Skin', 'Hair'], base: 14500, comm: 10, spec: 'Threading, pedicure', months: 4 },
    ],
  },
  {
    key: 'gc_tn', brand: true, owner: 'farhan', name: 'GlowCraft T Nagar', area: 'T Nagar', city: 'Chennai', lat: 13.0418, lng: 80.2341,
    address: 'Usman Road, T Nagar, Chennai 600017', gender_type: 'unisex', price_level: 3, open: '10:00', close: '21:00', hue: 270, plan: 'franchise',
    women_staff: 0, home_service: 0, private_rooms: 0, gold_partner: 0, menu: 'unisex', priceX: 1.0, daily: 21, returnRate: 0.42, rebook: 0.15, retail: 0.1, discount: 0.22, noShow: 0.11,
    tagline: 'GlowCraft in the heart of T Nagar shopping', upi: 'glowcraft.tnagar@okicici', gst: '33AABCG1234F3Z3',
    manager: { key: 'vignesh', name: 'Vignesh Balaji', gender: 'M', email: 'vignesh@glowcraft.in', phone: '9000000304' },
    staff: [
      { key: 'ramesh', name: 'Ramesh Pillai', gender: 'M', level: 'senior', title: 'Senior Stylist', skills: ['Hair', 'Men', 'Colour', 'Treatments'], base: 24000, comm: 14, spec: 'Colour, keratin', months: 30 },
      { key: 'sowmya', name: 'Sowmya Raman', gender: 'F', level: 'senior', title: 'Skin Expert', skills: ['Skin', 'Waxing', 'Nails', 'Makeup'], base: 22000, comm: 14, spec: 'Facials, bridal', months: 20 },
      { key: 'manoj', name: 'Manoj Kumar', gender: 'M', level: 'junior', title: 'Stylist', skills: ['Hair', 'Men'], base: 16000, comm: 12, spec: 'Haircuts, beard', months: 8 },
      { key: 'anitha', name: 'Anitha J', gender: 'F', level: 'junior', title: 'Beauty Therapist', skills: ['Waxing', 'Nails', 'Skin', 'Hair'], base: 15000, comm: 12, spec: 'Waxing', months: 3 },
    ],
  },
  {
    key: 'gc_kor', brand: true, owner: 'sneha', name: 'GlowCraft Koramangala', area: 'Koramangala', city: 'Bengaluru', lat: 12.9352, lng: 77.6245,
    address: '80 Feet Road, 4th Block, Koramangala, Bengaluru 560034', gender_type: 'unisex', price_level: 3, open: '09:00', close: '21:00', hue: 315, plan: 'franchise',
    women_staff: 1, home_service: 0, private_rooms: 1, gold_partner: 1, menu: 'unisex', priceX: 1.15, daily: 24, returnRate: 0.55, rebook: 0.3, retail: 0.2, discount: 0.07, noShow: 0.06,
    tagline: 'Quick, premium grooming for Koramangala professionals', upi: 'glowcraft.koramangala@oksbi', gst: '29AABCG1234F1Z9',
    manager: { key: 'kiran', name: 'Kiran Hegde', gender: 'M', email: 'kiran@glowcraft.in', phone: '9000000305' },
    staff: [
      { key: 'naveen', name: 'Naveen Shetty', gender: 'M', level: 'senior', title: 'Senior Stylist', skills: ['Hair', 'Men', 'Colour', 'Treatments'], base: 26000, comm: 12, spec: 'Textured cuts, colour', months: 24 },
      { key: 'pooja', name: 'Pooja Gupta', gender: 'F', level: 'senior', title: 'Colour Specialist', skills: ['Hair', 'Colour', 'Treatments'], base: 25000, comm: 12, spec: 'Balayage, curly hair', months: 20 },
      { key: 'rohit', name: 'Rohit Jain', gender: 'M', level: 'junior', title: 'Barber', skills: ['Men', 'Hair'], base: 16000, comm: 10, spec: 'Fades, beards', months: 10 },
      { key: 'shalini', name: 'Shalini Murthy', gender: 'F', level: 'junior', title: 'Skin & Nails', skills: ['Skin', 'Waxing', 'Nails', 'Makeup'], base: 16000, comm: 10, spec: 'Gel nails, facials', months: 8 },
    ],
  },
  {
    key: 'mane', brand: false, owner: 'meera', name: 'The Mane Room', area: 'Indiranagar', city: 'Bengaluru', lat: 12.9784, lng: 77.6408,
    address: '12th Main, HAL 2nd Stage, Indiranagar, Bengaluru 560038', gender_type: 'unisex', price_level: 4, open: '10:00', close: '21:00', hue: 165, plan: 'pro',
    women_staff: 1, home_service: 0, private_rooms: 1, gold_partner: 1, menu: 'unisex', priceX: 1.45, daily: 22, returnRate: 0.6, rebook: 0.42, retail: 0.27, discount: 0.05, noShow: 0.05,
    tagline: 'Curly hair, colour and keratin specialists', upi: 'maneroom@okaxis', gst: '29AAFCM5678K1Z2',
    manager: { key: 'tanvi', name: 'Tanvi Shah', gender: 'F', email: 'manager@maneroom.in', phone: '9000000302' },
    staff: [
      { key: 'aditya', name: 'Aditya Rao', gender: 'M', level: 'educator', title: 'Creative Director', skills: ['Hair', 'Colour', 'Treatments', 'Men'], base: 40000, comm: 12, spec: 'Balayage, colour correction, curly hair', months: 60 },
      { key: 'zoya', name: 'Zoya Khan', gender: 'F', level: 'senior', title: 'Curl Specialist', skills: ['Hair', 'Treatments', 'Colour'], base: 30000, comm: 12, spec: 'Curly cuts, keratin, Olaplex', months: 30 },
      { key: 'vikram', name: 'Vikram Nair', gender: 'M', level: 'senior', title: 'Master Barber', skills: ['Men', 'Hair'], base: 26000, comm: 12, spec: 'Skin fades, beard design', months: 28 },
      { key: 'ananya', name: 'Ananya Bose', gender: 'F', level: 'junior', title: 'Skin Therapist', skills: ['Skin', 'Waxing', 'Nails', 'Makeup'], base: 18000, comm: 10, spec: 'Facials, gel nails', months: 10 },
      { key: 'rakesh', name: 'Rakesh Gowda', gender: 'M', level: 'junior', title: 'Stylist', skills: ['Hair', 'Men'], base: 17000, comm: 10, spec: 'Haircuts, blow-dry', months: 6 },
    ],
  },
  {
    key: 'barber', brand: false, owner: 'imran', name: 'Barber Bros', area: 'Adyar', city: 'Chennai', lat: 13.0012, lng: 80.2565,
    address: 'LB Road, Adyar, Chennai 600020', gender_type: 'men', price_level: 1, open: '08:30', close: '21:30', hue: 25, plan: 'growth',
    women_staff: 0, home_service: 0, private_rooms: 0, gold_partner: 0, menu: 'men', priceX: 1.0, daily: 30, returnRate: 0.66, rebook: 0.2, retail: 0.12, discount: 0.04, noShow: 0.04,
    tagline: 'Classic cuts, hot towel shaves, no waiting with live queue', upi: 'barberbros@okhdfc', gst: '33AAKFB9012L1Z7',
    manager: null,
    staff: [
      { key: 'salman', name: 'Salman Shaikh', gender: 'M', level: 'senior', title: 'Head Barber', skills: ['Men', 'Colour', 'Treatments', 'Skin'], base: 22000, comm: 12, spec: 'Skin fades, beard styling', months: 40 },
      { key: 'dinesh', name: 'Dinesh Babu', gender: 'M', level: 'senior', title: 'Barber', skills: ['Men', 'Treatments', 'Skin'], base: 18000, comm: 10, spec: 'Hot towel shave', months: 20 },
      { key: 'prakash', name: 'Prakash R', gender: 'M', level: 'junior', title: 'Barber', skills: ['Men', 'Colour'], base: 14000, comm: 10, spec: 'Haircuts', months: 8 },
      { key: 'akbar', name: 'Akbar Ali', gender: 'M', level: 'junior', title: 'Barber', skills: ['Men', 'Treatments'], base: 14000, comm: 10, spec: 'Beard trims, head massage', months: 5 },
    ],
  },
  {
    key: 'lotus', brand: false, owner: 'revathi', name: 'Lotus Ladies Salon', area: 'Mylapore', city: 'Chennai', lat: 13.0339, lng: 80.2676,
    address: 'Luz Church Road, Mylapore, Chennai 600004', gender_type: 'women', price_level: 2, open: '09:00', close: '20:30', hue: 340, plan: 'growth',
    women_staff: 1, home_service: 1, private_rooms: 1, gold_partner: 1, menu: 'women', priceX: 0.9, daily: 21, returnRate: 0.57, rebook: 0.3, retail: 0.18, discount: 0.06, noShow: 0.05,
    tagline: 'Women-only salon with all-women staff, bridal and home service', upi: 'lotusladies@okaxis', gst: '33AAPFL3456M1Z1',
    manager: { key: 'kavya', name: 'Kavya Subramanian', gender: 'F', email: 'kavya@lotussalon.in', phone: '9000000306' },
    staff: [
      { key: 'meenakshi', name: 'Meenakshi Iyer', gender: 'F', level: 'educator', title: 'Bridal Artist', skills: ['Makeup', 'Skin', 'Hair', 'Colour'], base: 28000, comm: 12, spec: 'South Indian bridal, saree draping', months: 72 },
      { key: 'gayathri', name: 'Gayathri K', gender: 'F', level: 'senior', title: 'Hair Expert', skills: ['Hair', 'Colour', 'Treatments'], base: 20000, comm: 11, spec: 'Hair spa, root touch-up', months: 30 },
      { key: 'banu', name: 'Banu Rekha', gender: 'F', level: 'junior', title: 'Beauty Therapist', skills: ['Waxing', 'Skin', 'Nails'], base: 13000, comm: 10, spec: 'Threading, waxing', months: 12 },
      { key: 'selvi', name: 'Selvi M', gender: 'F', level: 'junior', title: 'Beauty Therapist', skills: ['Waxing', 'Nails', 'Skin', 'Hair'], base: 12500, comm: 10, spec: 'Pedicure, clean-up', months: 6 },
    ],
  },
];

export const OWNERS = {
  anand: { name: 'Anand Krishnan', gender: 'M', email: 'franchisee@glowcraft.in', phone: '9000000202', city: 'Chennai' },
  farhan: { name: 'Farhan Ali', gender: 'M', email: 'farhan@glowcraft.in', phone: '9000000203', city: 'Chennai' },
  sneha: { name: 'Sneha Reddy', gender: 'F', email: 'sneha@glowcraft.in', phone: '9000000204', city: 'Bengaluru' },
  meera: { name: 'Meera Iyer', gender: 'F', email: 'owner@maneroom.in', phone: '9000000201', city: 'Bengaluru' },
  imran: { name: 'Imran Shaikh', gender: 'M', email: 'imran@barberbros.in', phone: '9000000205', city: 'Chennai' },
  revathi: { name: 'Revathi Subramanian', gender: 'F', email: 'revathi@lotussalon.in', phone: '9000000206', city: 'Chennai' },
};

// Salon product catalogue (name → [kind, unit, mrp, cost, category, brand, refill_days])
export const PRODUCTS = [
  ['Hair Colour Tube 60g', 'backbar', 'tube', 0, 310, 'Colour', 'ColorPro'],
  ['Developer 1L', 'backbar', 'btl', 0, 420, 'Colour', 'ColorPro'],
  ['Lightener 500g', 'backbar', 'tub', 0, 1650, 'Colour', 'ColorPro'],
  ['Hair Spa Cream 500g', 'backbar', 'tub', 0, 780, 'Care', 'Veda Pro'],
  ['Keratin Smooth Kit 1L', 'backbar', 'kit', 0, 5200, 'Care', 'Veda Pro'],
  ['Facial Kit (pack of 5)', 'backbar', 'pack', 0, 950, 'Skin', 'SkinVeda'],
  ['Liposoluble Wax 800ml', 'backbar', 'tin', 0, 690, 'Waxing', 'SilkWax'],
  ['Repair Shampoo 300ml', 'retail', 'btl', 795, 450, 'Care', 'Veda Pro', 45],
  ['Repair Conditioner 250ml', 'retail', 'btl', 745, 420, 'Care', 'Veda Pro', 45],
  ['Keratin Smooth Shampoo 250ml', 'retail', 'btl', 950, 540, 'Care', 'Veda Pro', 40],
  ['Keratin Smooth Mask 200g', 'retail', 'jar', 1250, 700, 'Care', 'Veda Pro', 60],
  ['Curl Defining Cream 150ml', 'retail', 'tube', 1100, 610, 'Styling', 'CurlWorks', 50],
  ['Colour Protect Shampoo 300ml', 'retail', 'btl', 850, 480, 'Care', 'ColorPro', 45],
  ['Anti-Dandruff Serum 50ml', 'retail', 'btl', 650, 330, 'Care', 'Veda Pro', 30],
  ['Beard Oil 30ml', 'retail', 'btl', 450, 210, 'Men', 'BeardCraft', 40],
  ['Matte Hair Wax 75g', 'retail', 'tin', 499, 230, 'Men', 'BeardCraft', 60],
  ['Vitamin C Face Serum 30ml', 'retail', 'btl', 1150, 590, 'Skin', 'SkinVeda', 45],
  ['Sunscreen SPF 50 50ml', 'retail', 'tube', 699, 360, 'Skin', 'SkinVeda', 40],
  ['Cuticle Oil 15ml', 'retail', 'btl', 299, 140, 'Nails', 'NailBar', 60],
];

export const VENDORS = [
  { key: 'dist', email: 'distributor@saloonbaba.in', phone: '9000000601', user: 'Venkat Rao', name: 'ProBeauty Distributors', type: 'distributor', city: 'Chennai', gstin: '33AAHFP4321D1Z6', hue: 205, about: 'Authorised distributor for professional colour, care and skin brands across Tamil Nadu and Karnataka. Next-day delivery, 30-day credit.' },
  { key: 'brand', email: 'brand@saloonbaba.in', phone: '9000000602', user: 'Ritu Malhotra', name: 'Veda Pro Haircare', type: 'brand', city: 'Bengaluru', gstin: '29AACCV8765E1Z3', hue: 140, about: 'Indian professional haircare brand: keratin, repair and scalp ranges made with Ayurvedic actives.' },
  { key: 'academy', email: 'academy@saloonbaba.in', phone: '9000000603', user: 'Shobha Kapoor', name: 'Shear Skills Academy', type: 'academy', city: 'Chennai', gstin: '33AAGFS2468H1Z0', hue: 45, about: 'Hands-on and online courses for working stylists. Certificates recognised by partner salons.' },
  { key: 'equip', email: 'equipment@saloonbaba.in', phone: '9000000604', user: 'Mohan Das', name: 'StyleChair Equipments', type: 'equipment', city: 'Chennai', gstin: '33AAJFS1357G1Z8', hue: 0, about: 'Salon chairs, wash units, steamers and sterilisers with on-site service and AMC.' },
];

// Distributor catalogue (also mapped to salon products by name)
export const VENDOR_PRODUCTS = {
  dist: [
    ['Hair Colour Tube 60g', 'ColorPro', 'Colour', 'tube', 310, 450, 12, 'Buy 24 get 2 free'],
    ['Developer 1L', 'ColorPro', 'Colour', 'btl', 420, 600, 6, null],
    ['Lightener 500g', 'ColorPro', 'Colour', 'tub', 1650, 2300, 2, null],
    ['Hair Spa Cream 500g', 'Veda Pro', 'Care', 'tub', 780, 1100, 4, null],
    ['Keratin Smooth Kit 1L', 'Veda Pro', 'Care', 'kit', 5200, 7400, 1, 'Free training with 3 kits'],
    ['Facial Kit (pack of 5)', 'SkinVeda', 'Skin', 'pack', 950, 1400, 4, null],
    ['Liposoluble Wax 800ml', 'SilkWax', 'Waxing', 'tin', 690, 990, 6, null],
    ['Repair Shampoo 300ml', 'Veda Pro', 'Care', 'btl', 450, 795, 6, null],
    ['Repair Conditioner 250ml', 'Veda Pro', 'Care', 'btl', 420, 745, 6, null],
    ['Keratin Smooth Shampoo 250ml', 'Veda Pro', 'Care', 'btl', 540, 950, 6, '10% extra margin in October'],
    ['Keratin Smooth Mask 200g', 'Veda Pro', 'Care', 'jar', 700, 1250, 6, null],
    ['Curl Defining Cream 150ml', 'CurlWorks', 'Styling', 'tube', 610, 1100, 6, null],
    ['Colour Protect Shampoo 300ml', 'ColorPro', 'Care', 'btl', 480, 850, 6, null],
    ['Anti-Dandruff Serum 50ml', 'Veda Pro', 'Care', 'btl', 330, 650, 6, null],
    ['Beard Oil 30ml', 'BeardCraft', 'Men', 'btl', 210, 450, 12, null],
    ['Matte Hair Wax 75g', 'BeardCraft', 'Men', 'tin', 230, 499, 12, null],
    ['Vitamin C Face Serum 30ml', 'SkinVeda', 'Skin', 'btl', 590, 1150, 6, null],
    ['Sunscreen SPF 50 50ml', 'SkinVeda', 'Skin', 'tube', 360, 699, 6, null],
    ['Cuticle Oil 15ml', 'NailBar', 'Nails', 'btl', 140, 299, 12, null],
    ['Disposable Towels (100)', 'CleanPro', 'Hygiene', 'pack', 380, 550, 5, null],
    ['Barbicide Disinfectant 1L', 'CleanPro', 'Hygiene', 'btl', 890, 1200, 2, null],
  ],
  brand: [
    ['Keratin Smooth Kit 1L', 'Veda Pro', 'Care', 'kit', 5000, 7400, 2, 'Direct from brand: 2 kits + free certification'],
    ['Keratin Smooth Shampoo 250ml', 'Veda Pro', 'Care', 'btl', 520, 950, 12, null],
    ['Keratin Smooth Mask 200g', 'Veda Pro', 'Care', 'jar', 680, 1250, 12, null],
    ['Repair Shampoo 300ml', 'Veda Pro', 'Care', 'btl', 440, 795, 12, null],
    ['Scalp Detox Tonic 100ml', 'Veda Pro', 'Care', 'btl', 520, 990, 12, 'Launch offer: 6 + 2 free'],
    ['Hair Spa Cream 500g', 'Veda Pro', 'Care', 'tub', 760, 1100, 6, null],
  ],
};

const L = (title, content, quiz) => ({ title, content, ...(quiz ? { quiz } : {}) });

export const COURSES = [
  {
    owner: 'brand_glowcraft', title: 'GlowCraft Hygiene Standard', category: 'SOP', level: 'basic', duration: 12, badge: 'Hygiene Hero',
    lessons: [
      L('Why hygiene sells', 'Clients notice clean tools before they notice your skill. Hygiene doubts are one of the top reasons women switch salons. Our hygiene badge on the SaloonBaba app is earned from your daily checklists.'),
      L('Tool sterilisation', 'Wash, disinfect (Barbicide 10 min), dry, then UV cabinet. Never keep combs in your pocket. Log every cycle in the opening checklist.', { q: 'How long should combs stay in disinfectant?', options: ['1 minute', '10 minutes', '1 hour'], answer: 1 }),
      L('Towels and linen', 'One fresh towel per client, used towels go straight into the closed bin. Count linen at closing.'),
      L('Station reset', 'Wipe the chair, mirror and trolley between clients. It takes 90 seconds and the client sees it.', { q: 'When should the station be wiped?', options: ['At closing', 'Between every client', 'Once a day'], answer: 1 }),
    ],
  },
  {
    owner: 'brand_glowcraft', title: 'Consultation & Rebooking', category: 'Client care', level: 'basic', duration: 10, badge: 'Rebook Pro',
    lessons: [
      L('The 2-minute consultation', 'Ask: what do you like about your hair today, what do you not like, how much time do you spend styling? Write the answer in the client card.'),
      L('Recommend, don’t sell', 'Tell the client what you used and why. "Your colour lasts longer with a sulphate-free shampoo" is advice, not a sales pitch. Use Prescribe in your app to send the home-care card.'),
      L('Book the next visit at the chair', 'Before the client leaves, suggest the date: "Your roots will show in about 5 weeks — shall I hold Saturday the 14th, 11 am for you?" Clients rebooked at the chair return far more often than walk-ins.', { q: 'When is the best time to rebook?', options: ['Before the client leaves', 'A month later by phone', 'Only if they ask'], answer: 0 }),
    ],
  },
  {
    owner: 'vendor_academy', title: 'Advanced Balayage', category: 'Colour', level: 'advanced', duration: 25, badge: 'Balayage Specialist', price: 1499,
    lessons: [
      L('Placement basics', 'Paint V-sections, keep saturation heavier at the ends. Leave the root soft for a lived-in grow-out.'),
      L('Toning', 'Lift to the right underlying pigment before toning. Yellow lifts need violet; orange needs blue.', { q: 'An orange lift needs which toner base?', options: ['Violet', 'Blue', 'Green'], answer: 1 }),
      L('Aftercare', 'Book a gloss in 6–8 weeks and prescribe colour-protect shampoo.'),
    ],
  },
  {
    owner: 'vendor_academy', title: 'Curly Hair Specialist', category: 'Cutting', level: 'intermediate', duration: 20, badge: 'Curl Specialist', price: 999,
    lessons: [
      L('Cut curls dry', 'Curls shrink differently. Cut each curl in its natural pattern while dry.'),
      L('Hydration first', 'Curly hair needs moisture: co-wash, leave-in, curl cream. Avoid brushing dry curls.', { q: 'How should curly hair be cut?', options: ['Wet and straightened', 'Dry, curl by curl', 'Only with a razor'], answer: 1 }),
    ],
  },
  {
    owner: 'vendor_academy', title: 'Selling Without Pushing', category: 'Retail', level: 'basic', duration: 8, badge: 'Home-care Advisor', price: 0,
    lessons: [
      L('Talk about results', 'Clients buy outcomes. Link a product to the result they liked in the mirror.'),
      L('Prescribe in the app', 'Use Prescribe after the service. The client gets a WhatsApp home-care card and you earn retail incentive when they buy.', { q: 'What do clients buy?', options: ['Brand names', 'Results', 'Discounts'], answer: 1 }),
    ],
  },
  {
    owner: 'vendor_brand', title: 'Veda Pro Keratin Smooth Certification', category: 'Treatments', level: 'intermediate', duration: 15, badge: 'Keratin Certified',
    lessons: [
      L('Prep', 'Clarify twice with the prep shampoo. Blow-dry 100% before applying.'),
      L('Seal', 'Flat iron at 210°C in thin sections, 7–10 passes for coarse hair.', { q: 'What iron temperature for sealing?', options: ['150°C', '210°C', '250°C'], answer: 1 }),
      L('Aftercare', 'No wash for 48 hours, sulphate-free shampoo after. Prescribe the Keratin Smooth shampoo and mask.'),
    ],
  },
];
