import json,time,datetime,hashlib,re
from pathlib import Path
from curl_cffi import requests as cr
from curl_cffi.const import CurlHttpVersion
from bs4 import BeautifulSoup
urls={'bulldog-pl':'https://bulldogjob.pl/companies/jobs','bulldog-com':'https://bulldogjob.com/companies/jobs','theprotocol':'https://theprotocol.it/praca'}
for name,url in urls.items():
 for profile,hv in [('chrome',None),('safari',None),('chrome-http1',CurlHttpVersion.V1_1)]:
  opts={'impersonate':'chrome' if profile.startswith('chrome') else 'safari','trust_env':False}
  with cr.Session(**opts) as s:
   try:
    kw={'http_version':hv} if hv else {}
    r=s.get(url,timeout=20,allow_redirects=False,**kw)
    row={'target':name,'url':url,'profile':profile,'status':r.status_code,'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'headers':{k:r.headers[k] for k in ['content-type','cf-mitigated','server','location'] if k in r.headers},'bytes':len(r.content),'http_version':r.http_version}
    if r.status_code==200:
     soup=BeautifulSoup(r.text,'html.parser'); n=soup.select_one('script#__NEXT_DATA__')
     row['title']=soup.title.get_text() if soup.title else None
     if n:
      data=json.loads(n.string or n.get_text()); pp=data.get('props',{}).get('pageProps',{});row['page_props_keys']=list(pp);row['build_id']=data.get('buildId');row['jobs_count']=len(pp.get('jobs',[]));row['total_count']=pp.get('totalCount');row['slug_state']=pp.get('slugState');
      Path('/tmp/'+name+'-next.json').write_text(json.dumps(data))
     row['scripts']=[x.get('src') for x in soup.select('script[src]')][:25]
     row['links']=[x.get('href') for x in soup.select('a[href]') if '/companies/jobs/' in x.get('href','')][:3]
    print(json.dumps(row),flush=True)
   except Exception as e: print(json.dumps({'target':name,'profile':profile,'error':type(e).__name__}),flush=True)
  time.sleep(2)
