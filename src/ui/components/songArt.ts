/**
 * Emoji cho từng bài hát (Thư viện, Sân khấu) — suy ra từ từ khóa trong tên bài; không khớp → 🎵.
 * Thứ tự quan trọng: từ khóa cụ thể đứng trước từ khóa chung ("con thuyền" trước "thuyền").
 */
import type { Tune } from '../../music/tune';

const KEYWORDS: Array<[RegExp, string]> = [
  // (+ 2026-10-09) bài Thư viện bổ sung — đứng trước các từ khóa chung ("cầu", "hoa", "xuân", "kiến")
  [/cá vàng/i, '🐠'],
  [/cá heo/i, '🐬'],
  [/gõ kiến/i, '🪶'],
  [/kiến/i, '🐜'],
  [/đồng hồ/i, '⏰'],
  [/nắng sớm/i, '☀️'],
  [/buổi sáng/i, '🌅'],
  [/cầu tuột/i, '🛝'],
  [/con ong|ong bay/i, '🐝'],
  [/rùa/i, '🐢'],
  [/tàu thủy/i, '🚢'],
  [/sóc nâu/i, '🐿️'],
  [/pháo hoa/i, '🎆'],
  [/yankee/i, '🎩'],
  [/giáng sinh/i, '🎄'],
  [/auld lang syne/i, '🤝'],
  [/mùa xuân về/i, '🌼'],
  [/vua núi/i, '👑'],
  [/thiên nga/i, '🦢'],
  [/sao băng/i, '🌠'],
  [/múa lân/i, '🦁'],
  [/rô-bốt|robot/i, '🤖'],
  [/siêu nhân/i, '🦸'],
  [/ninja/i, '🥷'],
  [/gà gáy/i, '🐓'],
  [/gà/i, '🐥'],
  [/vịt/i, '🦆'],
  [/cừu/i, '🐑'],
  [/ếch/i, '🐸'],
  [/ốc sên/i, '🐌'],
  [/mèo/i, '🐱'],
  [/voi/i, '🐘'],
  [/thỏ/i, '🐰'],
  [/gấu/i, '🧸'],
  [/bướm/i, '🦋'],
  [/chim sẻ|con sáo/i, '🐦'],
  [/ngựa/i, '🐴'],
  [/trang trại/i, '🚜'],
  [/tàu hỏa/i, '🚂'],
  [/xích lô/i, '🛺'],
  [/đua thuyền|chèo thuyền|thuyền giấy|thuyền trôi|con thuyền|đò|thuyền/i, '⛵'],
  [/diều/i, '🪁'],
  [/trăng|trung thu|đêm thu/i, '🌙'],
  [/rước đèn/i, '🏮'],
  [/ngôi sao|đêm thánh/i, '⭐'],
  [/sinh nhật/i, '🎂'],
  [/bánh chưng|tết|xuân/i, '🧧'],
  [/bánh nóng/i, '🥐'],
  [/mưa/i, '🌧️'],
  [/chuông/i, '🔔'],
  [/trống/i, '🥁'],
  [/niềm vui/i, '😄'],
  [/thánh tiến bước/i, '🎺'],
  [/london|cầu/i, '🌉'],
  [/susanna/i, '🪕'],
  [/ông lão/i, '👴'],
  [/tiếng vọng|thung lũng/i, '⛰️'],
  [/vạch phụ/i, '🪜'],
  [/gam/i, '🎹'],
  [/minuet|valse/i, '💃'],
  [/xòe hoa|cây bông|hoa/i, '🌸'],
  [/cây đa|cây xanh/i, '🌳'],
  [/mây/i, '☁️'],
  [/inh lả|ngày mùa/i, '🌾'],
  [/elise/i, '🌹'],
  [/canon|largo/i, '🎻'],
  [/đôi bạn|song ca|hỏi/i, '💬'],
  [/người ơi|cò lả|bắc kim thang/i, '🎋'],
];

export function songEmoji(t: Pick<Tune, 'titleVi'>): string {
  for (const [re, e] of KEYWORDS) if (re.test(t.titleVi)) return e;
  return '🎵';
}

/** Tên ngắn cho thẻ bài của bé: bỏ phần ghi chú trong ngoặc ("(dân ca Nam Bộ)") — nguồn gốc hiện ở dòng dưới. */
export const shortTitle = (t: Pick<Tune, 'titleVi'>): string => t.titleVi.replace(/\s*\([^)]*\)\s*$/, '');
