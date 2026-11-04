import json,time,datetime
from pathlib import Path
from bs4 import BeautifulSoup
from curl_cffi import requests as cr
from curl_cffi.const import CurlHttpVersion
from urllib.parse import urljoin
import requests
base={name:json.loads(Path('/tmp/'+name+'-next.json').read_text()) for name in ['bulldog-pl','bulldog-com','theprotocol']}
def getpp(data): return data['props']['pageProps']
bp=getpp(base['bulldog-pl']);cp=getpp(base['bulldog-com']);tp=getpp(base['theprotocol']);bo=bp['jobs'][0];to=tp['offersResponse']['offers'][0]
plids={j['id'] for j in bp['jobs']};comids={j['id'] for j in cp['jobs']};tpids={j['id'] for j in tp['offersResponse']['offers']}
print(json.dumps({'kind':'domain_comparison','pl_count':bp['totalCount'],'com_count':cp['totalCount'],'first_page_shared_ids':len(plids&comids),'first_page_pl_only':len(plids-comids),'first_page_com_only':len(comids-plids)}),flush=True)
tests=[
 ('bulldog-page2','https://bulldogjob.pl/companies/jobs/s/page,2',None),
 ('bulldog-last','https://bulldogjob.pl/companies/jobs/s/page,21',None),
 ('bulldog-php-senior','https://bulldogjob.pl/companies/jobs/s/skills,PHP/experienceLevel,senior',None),
 ('bulldog-go','https://bulldogjob.pl/companies/jobs/s/skills,Go',None),
 ('bulldog-detail','https://bulldogjob.pl/companies/jobs/'+bo['id'],bo['id']),
 ('theprotocol-page2','https://theprotocol.it/praca?pageNumber=2',None),
 ('theprotocol-last','https://theprotocol.it/praca?pageNumber=83',None),
 ('theprotocol-go','https://theprotocol.it/filtry/go;t',None),
 ('theprotocol-detail','https://theprotocol.it/praca/'+to['offerUrlName'],to['id']),
]
for name,url,expected in tests:
 row={'kind':'data_validation','name':name,'url':url,'time':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 try:
  with cr.Session(impersonate='chrome',trust_env=False) as s:
   r=s.get(url,timeout=20,allow_redirects=False)
   row.update(status=r.status_code,http_version=r.http_version,content_type=r.headers.get('content-type'),challenge=r.headers.get('cf-mitigated'),location=r.headers.get('location'))
   if r.status_code==200:
    soup=BeautifulSoup(r.text,'html.parser');tag=soup.select_one('script#__NEXT_DATA__');row['has_next_data']=bool(tag)
    if tag:
     d=json.loads(tag.get_text());p=getpp(d);row['build_id']=d.get('buildId')
     if 'bulldog' in name:
      jobs=p.get('jobs');job=p.get('data',{}).get('job')
      if jobs is not None:
       ids={j.get('id') for j in jobs};row.update(count=len(jobs),unique_ids=len(ids),overlap_page1=len(ids&plids),total=p.get('totalCount'),slug_state=p.get('slugState'))
      if job:
       row.update(id_matches=job.get('id')==expected,detail_keys=list(job),offer_chars=len(job.get('offer') or ''),requirements_chars=len(job.get('requirements') or ''),state=job.get('state'),has_dates=bool(job.get('publishedAt') and job.get('endsAt')))
     else:
      response=p.get('offersResponse')
      if response:
       offers=response.get('offers',[]);ids={j.get('id') for j in offers};row.update(count=len(offers),unique_ids=len(ids),overlap_page1=len(ids&tpids),page=response.get('page'),total=response.get('offersCount'),filters=response.get('filters'))
      job=p.get('offer')
      if job:
       row.update(id_matches=job.get('id')==expected,detail_keys=list(job),has_technologies=bool(job.get('technologies')),text_sections_count=len(job.get('textSections') or []),has_publication_details=bool(job.get('publicationDetails')))
    row['jsonld_jobposting']='JobPosting' in ' '.join(x.get_text() for x in soup.select('script[type="application/ld+json"]'))
 except Exception as e:row['error']=type(e).__name__
 print(json.dumps(row),flush=True);time.sleep(2)
# Fresh sessions: compare protocol within curl_cffi without impersonation, and baseline requests.
for domain,url in [('bulldog-pl','https://bulldogjob.pl/companies/jobs'),('theprotocol','https://theprotocol.it/praca')]:
 for profile in ['plain-curl-http2','chrome-http2','requests-baseline','chrome-http2-repeat']:
  row={'kind':'transport_control','target':domain,'profile':profile,'time':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  try:
   if profile=='requests-baseline':
    with requests.Session() as s:
     s.trust_env=False;r=s.get(url,timeout=20,allow_redirects=False)
   else:
    with cr.Session(trust_env=False,impersonate='chrome' if profile.startswith('chrome') else None) as s:
     r=s.get(url,timeout=20,allow_redirects=False,http_version=CurlHttpVersion.V2_0)
   row.update(status=r.status_code,challenge=r.headers.get('cf-mitigated'),has_next_data='__NEXT_DATA__' in r.text,http_version=getattr(r,'http_version',None))
  except Exception as e:row['error']=type(e).__name__
  print(json.dumps(row),flush=True);time.sleep(2)
