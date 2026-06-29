import * as cheerio from 'cheerio';

const res = await fetch('https://www.divine-pride.net/database/item/19499', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});

const html = await res.text();
const $ = cheerio.load(html);

// Testa exatamente o seletor do scraper corrigido
console.log('=== legend:not(.entry-title) ===');
const legends = $('legend:not(.entry-title)');
console.log('count:', legends.length);
legends.each((i, el) => {
  const text = $(el).text().trim();
  console.log(`[${i}] text: "${text}"`);
  console.log(`[${i}] includes Scripts:`, text.includes('Scripts'));
  if (text.includes('Scripts')) {
    const lis = $(el).parent().find('ul li');
    console.log(`  -> lis encontrados:`, lis.length);
    lis.each((j, li) => {
      const href = $(li).find('a').attr('href') ?? 'sem href';
      const fn = href.match(/function=(\d+)/);
      console.log(`  li[${j}] fn=${fn ? fn[1] : 'none'}: ${$(li).text().trim().substring(0, 80)}`);
    });
  }
});
