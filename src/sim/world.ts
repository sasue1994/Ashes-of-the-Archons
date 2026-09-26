import { H, W } from './data';
import { addRuin } from './ruins';
import { S, spawn } from './state';

// สร้างแผนที่เริ่มต้น (ใช้ seed คงที่ ทุกเกมได้แผนที่เดิม)
export function initWorld() {
  let seed = 7; const srnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 220; i++) { const x = srnd() * W, y = srnd() * H, w = 6 + srnd() * 30; srnd(); srnd(); S.rubble.push({ x, y, w }) }
  const addOre = (x: number, y: number, kind: 'ore' | 'xen' = 'ore', n = 10) => {
    for (let i = 0; i < n; i++) { const a = srnd() * 6.28, d = srnd() * 70; S.ores.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, amt: 400, kind }) }
  };
  [[220, 1720], [720, 2260], [2980, 680], [2480, 140], [1250, 1450], [1950, 950]].forEach(p => addOre(p[0], p[1]));
  [[820, 1620], [2380, 780], [1600, 560], [1600, 1840]].forEach(p => addOre(p[0], p[1], 'xen', 8));

  addRuin('outpost', 1150, 2000); addRuin('outpost', 2050, 400); addRuin('outpost', 450, 1150); addRuin('outpost', 2750, 1250);
  addRuin('monolith', 800, 750); addRuin('monolith', 2400, 1650); addRuin('citadel', 1600, 1200);

  spawn('hq', 0, 300, 2100); spawn('ref', 0, 500, 2170); spawn('turret', 0, 560, 1960); spawn('turret', 0, 260, 1900); spawn('harv', 0, 430, 2060);
  for (let i = 0; i < 4; i++) spawn('rifle', 0, 470 + (i % 2) * 34, 1880 + Math.floor(i / 2) * 30);
  spawn('tank', 0, 420, 1960); spawn('rig', 0, 380, 1990); spawn('vault', 0, 150, 2000);
  spawn('hq', 1, 2900, 300); spawn('ref', 1, 2700, 230); spawn('turret', 1, 2640, 440); spawn('turret', 1, 2940, 500); spawn('harv', 1, 2770, 380);
  for (let i = 0; i < 4; i++) spawn('rifle', 1, 2700 - (i % 2) * 34, 500 + Math.floor(i / 2) * 30);
  spawn('tank', 1, 2780, 470); spawn('rig', 1, 2820, 420); spawn('vault', 1, 3050, 400);
}
