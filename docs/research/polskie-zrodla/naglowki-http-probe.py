import requests,json,time,datetime,hashlib
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'
HTML='text/html,application/xhtml+xml,application/xml;q=0.9,image/jxl,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
LANG='pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7'
NFJ='https://nofluffjobs.com/api/search/posting?pageFrom=1&withSalaryMatch=true&pageTo=1&pageSize=20&salaryCurrency=original&salaryPeriod=original&region=pl&language=pl-PL'
targets=[('nfj-html','https://nofluffjobs.com/pl'),('nfj-api',NFJ),('bulldog-pl','https://bulldogjob.pl/companies/jobs'),('bulldog-com','https://bulldogjob.com/companies/jobs'),('theprotocol','https://theprotocol.it/praca')]
for name,url in targets:
 api=name=='nfj-api'
 base={'Content-Type':'application/json'} if api else {}
 profiles=[('baseline',{}),('ua',{'User-Agent':UA}),('accept',{'Accept':'application/json, text/plain, */*' if api else HTML}),('language',{'Accept-Language':LANG})]
 if api:
  profiles += [('content-type',{'Content-Type':'application/infiniteSearch+json'}),('origin',{'Origin':'https://nofluffjobs.com'}),('referer',{'Referer':'https://nofluffjobs.com/pl'})]
 combined={'User-Agent':UA,'Accept':'application/json, text/plain, */*' if api else HTML,'Accept-Language':LANG,'sec-ch-ua':'"Not:A-Brand";v="8", "Chromium";v="156", "Google Chrome";v="156"','sec-ch-ua-mobile':'?0','sec-ch-ua-platform':'"macOS"','sec-fetch-dest':'empty' if api else 'document','sec-fetch-mode':'cors' if api else 'navigate','sec-fetch-site':'same-origin'}
 if api: combined.update({'Content-Type':'application/infiniteSearch+json','Origin':'https://nofluffjobs.com','Referer':'https://nofluffjobs.com/pl','Cache-Control':'no-cache','Pragma':'no-cache'})
 else: combined.update({'sec-fetch-user':'?1','Upgrade-Insecure-Requests':'1'})
 profiles += [('combined',combined),('baseline-repeat',{})]
 for profile,extra in profiles:
  result={'target':name,'profile':profile,'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':url,'changed_headers':extra}
  try:
   with requests.Session() as s:
    s.trust_env=False
    r=s.request('POST' if api else 'GET',url,headers={**base,**extra},data='{"rawSearch":"requirement=PHP"}' if api else None,timeout=(8,15),allow_redirects=False)
    body=r.content
    result.update(status=r.status_code,bytes=len(body),body_sha256=hashlib.sha256(body).hexdigest(),response_headers={k:r.headers[k] for k in ['Content-Type','Server','Location','cf-mitigated','x-cache','Via'] if k in r.headers},challenge_marker=any(t in r.text.lower() for t in ['cf-chl-','just a moment','challenge-platform']),next_data='__NEXT_DATA__' in r.text,angular_state='serverApp-state' in r.text)
    if 'application/json' in r.headers.get('Content-Type',''):
     try:
      j=r.json(); result['json_type']=type(j).__name__; result['json_keys']=list(j)[:30] if isinstance(j,dict) else []
     except ValueError: result['invalid_json']=True
  except requests.RequestException as e: result['error_type']=type(e).__name__
  print(json.dumps(result),flush=True)
  time.sleep(2)
