// fill-discovery.js — Llenar discovery_news si está vacío
(async function(){
  var TICKERS = ['TSLA','AMZN','AAPL','GOOGL','AMD','AVGO','SNOW','PLTR','COIN','ARM'];
  
  async function getNews(ticker){
    try {
      var url = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/' + ticker + '?modules=news';
      var res = await fetch(url);
      var data = await res.json();
      var items = data?.quoteSummary?.result?.[0]?.news || [];
      return items.slice(0,3).map(function(item){
        return {
          ticker: ticker,
          title: item.title,
          link: item.link,
          source: item.source,
          date: item.providerPublishTime
        };
      });
    } catch(e) { return []; }
  }
  
  async function translateText(text){
    try {
      var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=' + encodeURIComponent(text);
      var res = await fetch(url);
      var data = await res.json();
      return (data[0]?.[0]?.[0] || text).substring(0, 120);
    } catch(e) { return text.substring(0,120); }
  }
  
  var allNews = [];
  for(var i=0; i<TICKERS.length; i++){
    var news = await getNews(TICKERS[i]);
    for(var j=0; j<news.length; j++){
      news[j].title_es = await translateText(news[j].title);
      allNews.push(news[j]);
    }
    await new Promise(r=>setTimeout(r,300));
  }
  
  var data = {
    ts: new Date().toISOString(),
    discovery_news: allNews.sort(function(a,b){return b.date-a.date;}).slice(0,30)
  };
  
  console.log('✅ Discovery news:', data.discovery_news.length, 'items');
  
  // Guardar en localStorage
  localStorage.setItem('discovery_cache', JSON.stringify(data));
})();
