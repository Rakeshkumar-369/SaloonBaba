// Vernacular UI for the staff and customer apps (labels most used between clients).
import { useAuth } from './auth.jsx';

export const LANGS = [
  ['en', 'English'], ['hi', 'हिन्दी'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['kn', 'ಕನ್ನಡ'], ['bn', 'বাংলা'],
];

const T = {
  today: { hi: 'आज', ta: 'இன்று', te: 'ఈరోజు', kn: 'ಇಂದು', bn: 'আজ' },
  my_day: { hi: 'मेरा दिन', ta: 'என் நாள்', te: 'నా రోజు', kn: 'ನನ್ನ ದಿನ', bn: 'আমার দিন' },
  earnings: { hi: 'कमाई', ta: 'வருமானம்', te: 'సంపాదన', kn: 'ಗಳಿಕೆ', bn: 'আয়' },
  attendance: { hi: 'हाज़िरी', ta: 'வருகை', te: 'హాజరు', kn: 'ಹಾಜರಾತಿ', bn: 'হাজিরা' },
  clients: { hi: 'ग्राहक', ta: 'வாடிக்கையாளர்கள்', te: 'కస్టమర్లు', kn: 'ಗ್ರಾಹಕರು', bn: 'গ্রাহক' },
  learn: { hi: 'सीखें', ta: 'கற்றல்', te: 'నేర్చుకోండి', kn: 'ಕಲಿಯಿರಿ', bn: 'শিখুন' },
  more: { hi: 'और', ta: 'மேலும்', te: 'మరిన్ని', kn: 'ಇನ್ನಷ್ಟು', bn: 'আরও' },
  check_in: { hi: 'चेक-इन करें', ta: 'வருகை பதிவு', te: 'చెక్-ఇన్', kn: 'ಚೆಕ್-ಇನ್', bn: 'চেক-ইন' },
  check_out: { hi: 'चेक-आउट', ta: 'வெளியேறு', te: 'చెక్-అవుట్', kn: 'ಚೆಕ್-ಔಟ್', bn: 'চেক-আউট' },
  appointments: { hi: 'अपॉइंटमेंट', ta: 'முன்பதிவுகள்', te: 'అపాయింట్‌మెంట్లు', kn: 'ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್‌ಗಳು', bn: 'অ্যাপয়েন্টমেন্ট' },
  commission: { hi: 'कमीशन', ta: 'கமிஷன்', te: 'కమీషన్', kn: 'ಕಮಿಷನ್', bn: 'কমিশন' },
  tips: { hi: 'टिप्स', ta: 'டிப்ஸ்', te: 'టిప్స్', kn: 'ಟಿಪ್ಸ್', bn: 'টিপস' },
  this_month: { hi: 'इस महीने', ta: 'இந்த மாதம்', te: 'ఈ నెల', kn: 'ಈ ತಿಂಗಳು', bn: 'এই মাসে' },
  target: { hi: 'लक्ष्य', ta: 'இலக்கு', te: 'లక్ష్యం', kn: 'ಗುರಿ', bn: 'লক্ষ্য' },
  start_service: { hi: 'सेवा शुरू करें', ta: 'சேவை தொடங்கு', te: 'సేవ ప్రారంభించండి', kn: 'ಸೇವೆ ಆರಂಭಿಸಿ', bn: 'সেবা শুরু' },
  prescribe: { hi: 'प्रोडक्ट सुझाएं', ta: 'பொருள் பரிந்துரை', te: 'ఉత్పత్తి సూచించండి', kn: 'ಉತ್ಪನ್ನ ಸೂಚಿಸಿ', bn: 'পণ্য সুপারিশ' },
  roster: { hi: 'शिफ्ट', ta: 'பணி அட்டவணை', te: 'షిఫ్ట్', kn: 'ಶಿಫ್ಟ್', bn: 'শিফট' },
  leave: { hi: 'छुट्टी', ta: 'விடுப்பு', te: 'సెలవు', kn: 'ರಜೆ', bn: 'ছুটি' },
  voice: { hi: 'आपकी आवाज़', ta: 'உங்கள் குரல்', te: 'మీ గొంతు', kn: 'ನಿಮ್ಮ ಧ್ವನಿ', bn: 'আপনার কথা' },
  portfolio: { hi: 'पोर्टफोलियो', ta: 'படைப்புகள்', te: 'పోర్ట్‌ఫోలియో', kn: 'ಪೋರ್ಟ್‌ಫೋಲಿಯೊ', bn: 'পোর্টফোলিও' },
  leaderboard: { hi: 'लीडरबोर्ड', ta: 'தரவரிசை', te: 'లీడర్‌బోర్డ్', kn: 'ಲೀಡರ್‌ಬೋರ್ಡ್', bn: 'লিডারবোর্ড' },
  discover: { hi: 'खोजें', ta: 'தேடு', te: 'కనుగొనండి', kn: 'ಹುಡುಕಿ', bn: 'খুঁজুন' },
  bookings: { hi: 'बुकिंग', ta: 'முன்பதிவு', te: 'బుకింగ్‌లు', kn: 'ಬುಕಿಂಗ್', bn: 'বুকিং' },
  offers: { hi: 'ऑफ़र', ta: 'சலுகைகள்', te: 'ఆఫర్లు', kn: 'ಆಫರ್‌ಗಳು', bn: 'অফার' },
  profile: { hi: 'प्रोफ़ाइल', ta: 'சுயவிவரம்', te: 'ప్రొఫైల్', kn: 'ಪ್ರೊಫೈಲ್', bn: 'প্রোফাইল' },
  book_now: { hi: 'अभी बुक करें', ta: 'இப்போது பதிவு', te: 'ఇప్పుడే బుక్ చేయండి', kn: 'ಈಗ ಬುಕ್ ಮಾಡಿ', bn: 'এখনই বুক করুন' },
  join_queue: { hi: 'कतार में जुड़ें', ta: 'வரிசையில் சேர்', te: 'క్యూలో చేరండి', kn: 'ಸರತಿಯಲ್ಲಿ ಸೇರಿ', bn: 'লাইনে যোগ দিন' },
  seat_in: { hi: 'सीट मिलेगी', ta: 'இருக்கை கிடைக்கும்', te: 'సీటు దొరుకుతుంది', kn: 'ಆಸನ ಸಿಗುತ್ತದೆ', bn: 'বসতে পারবেন' },
  min: { hi: 'मिनट', ta: 'நிமி', te: 'నిమి', kn: 'ನಿಮಿ', bn: 'মিনিট' },
  open_now: { hi: 'अभी खुला', ta: 'இப்போது திறந்துள்ளது', te: 'ఇప్పుడు తెరిచి ఉంది', kn: 'ಈಗ ತೆರೆದಿದೆ', bn: 'এখন খোলা' },
  search_need: { hi: 'सेवा, सैलून या ज़रूरत खोजें', ta: 'சேவை, சலூன் அல்லது தேவை தேடுங்கள்', te: 'సేవ, సెలూన్ లేదా అవసరం వెతకండి', kn: 'ಸೇವೆ, ಸಲೂನ್ ಅಥವಾ ಅಗತ್ಯ ಹುಡುಕಿ', bn: 'সেবা, সেলুন বা প্রয়োজন খুঁজুন' },
  wallet: { hi: 'वॉलेट', ta: 'பணப்பை', te: 'వాలెట్', kn: 'ವಾಲೆಟ್', bn: 'ওয়ালেট' },
  shop: { hi: 'शॉप', ta: 'கடை', te: 'షాప్', kn: 'ಅಂಗಡಿ', bn: 'দোকান' },
  logout: { hi: 'लॉग आउट', ta: 'வெளியேறு', te: 'లాగ్ అవుట్', kn: 'ಲಾಗ್ ಔಟ್', bn: 'লগ আউট' },
  language: { hi: 'भाषा', ta: 'மொழி', te: 'భాష', kn: 'ಭಾಷೆ', bn: 'ভাষা' },
};

const EN = Object.fromEntries(Object.keys(T).map((k) => [k, k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())]));
EN.my_day = 'My day';
EN.check_in = 'Check in';
EN.check_out = 'Check out';
EN.start_service = 'Start service';
EN.prescribe = 'Prescribe products';
EN.voice = 'Voice';
EN.book_now = 'Book now';
EN.join_queue = 'Join queue';
EN.seat_in = 'Seat in';
EN.open_now = 'Open now';
EN.search_need = 'Search a service, salon or need (curly hair, bridal…)';
EN.this_month = 'This month';
EN.logout = 'Log out';
EN.min = 'min';

export function translate(lang, key) {
  return (lang !== 'en' && T[key]?.[lang]) || EN[key] || key;
}

export function useT() {
  const { user } = useAuth();
  const lang = user?.lang || localStorage.getItem('sb_lang') || 'en';
  return (key) => translate(lang, key);
}
