import json,time,datetime
from pathlib import Path
from bs4 import BeautifulSoup
from curl_cffi import requests as cr
for name in ['bulldog-pl','theprotocol']:
 d=json.loads(Path('/tmp/'+name+'-next.json').read_text());b=d['buildId'];host='https://bulldogjob.pl' if name=='bulldog-pl' else 'https://theprotocol.it';path='/companies/jobs' if name=='bulldog-pl' else '/praca'
 cases=[('next-json',f'{host}/_next/data/{b}{path}.json')]
 if name=='bulldog-pl':cases += [('detail-variant','https://bulldogjob.pl/companies/jobs/258259-senior-php-developer-devire')]
 for kind,url in cases:
  row={'target':name,'kind':kind,'url':url,'time':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  try:
   with cr.Session(impersonate='chrome',trust_env=False) as s:
    r=s.get(url,timeout=20,allow_redirects=False);row.update(status=r.status_code,bytes=len(r.content),content_type=r.headers.get('content-type'),challenge=r.headers.get('cf-mitigated'),location=r.headers.get('location'))
    if r.status_code==200:
     if 'application/json' in r.headers.get('content-type',''):
      j=r.json();p=j.get('pageProps',j.get('props',{}).get('pageProps',{}));jobs=p.get('jobs',p.get('offersResponse',{}).get('offers',[]));row.update(json_keys=list(j),page_props_keys=list(p),count=len(jobs))
     else:
      soup=BeautifulSoup(r.text,'html.parser');n=soup.select_one('script#__NEXT_DATA__')
      if n:
       p=json.loads(n.get_text())['props']['pageProps'];job=p.get('data',{}).get('job',{});row['text_fields']={k:{'type':type(job.get(k)).__name__,'chars':len(str(job.get(k) or ''))} for k in ['offer','details','requirements','recruitmentProcess']};row['detail_id']=job.get('id')
  except Exception as e:row['error']=type(e).__name__
  print(json.dumps(row),flush=True);time.sleep(2)
