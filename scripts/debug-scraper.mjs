import * as cheerio from 'cheerio';

const res = await fetch('https://www.divine-pride.net/database/item/19499', {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});

const html = await res.text();
const $ = cheerio.load(html);

$('legend').each((i, el) => {
  if ($(el).text().trim() !== 'Scripts') return;

  console.log('--- Scripts legend encontrada ---');
  const parent = $(el).parent();
  console.log('parent tag:', parent.get(0).tagName);
  console.log('parent html (500 chars):');
  console.log($.html(parent).substring(0, 500));

  console.log('\nsiblings:', $(el).siblings().map((i, s) => s.tagName).get());
  console.log('siblings ul:', $(el).siblings('ul').length);
  console.log('parent find ul:', parent.find('ul').length);
  console.log('parent find li:', parent.find('li').length);

  parent.find('li').each((i, li) => {
    console.log(`li ${i}:`, $(li).text().trim().substring(0, 100));
  });
});
