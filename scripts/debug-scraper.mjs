import * as cheerio from 'cheerio';

const res = await fetch('https://www.divine-pride.net/database/item/19499', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});

const html = await res.text();
const $ = cheerio.load(html);

console.log('legends encontradas:', $('legend').length);
$('legend').each((i, el) => {
  console.log(`legend ${i}:`, $(el).text().trim().substring(0, 60));
});

console.log('\nul dentro de fieldset:', $('fieldset ul').length);
console.log('li dentro de fieldset:', $('fieldset ul li').length);

$('fieldset ul li').each((i, el) => {
  const text = $(el).text().trim().substring(0, 80);
  const href = $(el).find('a').attr('href') ?? 'no-href';
  const fn   = href.match(/function=(\d+)/);
  console.log(`li ${i} [fn=${fn ? fn[1] : 'none'}]:`, text);
});
