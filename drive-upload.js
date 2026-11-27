import {DRIVE_CLIENT_ID} from './drive-config.js?v=3.5';
const SCOPE='https://www.googleapis.com/auth/drive.file';
export const MAX_BYTES=200*1024*1024;
export const driveConfigured=()=>/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(DRIVE_CLIENT_ID.trim());
let library;
export function prepareDrive(){
 if(!driveConfigured())return Promise.reject(new Error('Google OAuth クライアント ID が未設定です。drive-config.js を設定してください。'));
 if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
 if(!library)library=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=()=>globalThis.google?.accounts?.oauth2?resolve():reject(new Error('Google 認証を初期化できません'));s.onerror=()=>reject(new Error('Google 認証を読み込めません。通信・学校のフィルタ設定を確認してください。'));document.head.append(s)}).catch(e=>{library=null;throw e});
 return library;
}
// ユーザーのクリックから直接呼び出す。トークンは端末に永続保存しない。
export function authorizeDrive(){return new Promise((resolve,reject)=>{
 const oauth=globalThis.google?.accounts?.oauth2;if(!oauth)return reject(new Error('Google 認証の準備ができていません'));
 const client=oauth.initTokenClient({client_id:DRIVE_CLIENT_ID.trim(),scope:SCOPE,include_granted_scopes:false,callback:r=>{if(r.error||!r.access_token||!oauth.hasGrantedAllScopes(r,SCOPE))reject(new Error('Google Drive の利用が許可されませんでした。'));else resolve(r.access_token)},error_callback:()=>reject(new Error('Google 認証画面が閉じられたか、ポップアップがブロックされました。'))});
 client.requestAccessToken({prompt:'select_account'});
})}
const fileTypes={mp4:'video/mp4',mov:'video/quicktime',m4v:'video/mp4',webm:'video/webm',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',heic:'image/heic',heif:'image/heif',webp:'image/webp',gif:'image/gif'};
export function checkedFile(file){const ext=String(file?.name||'').split('.').pop().toLowerCase();const type=fileTypes[ext];if(!file?.size||file.size>MAX_BYTES||!type)throw Error('MP4・MOV・WebM または JPG・PNG・HEIC 等の写真を200MB以内で選択してください。');return {type,ext}}
async function checkedResponse(res){if(!res.ok){let msg='';try{msg=(await res.json()).error?.message||''}catch{}throw Error(`Google Drive エラー (${res.status}) ${msg}`)}return res}
export async function uploadDrive(file,title,category,date,token,progress,signal){
 const {type,ext}=checkedFile(file);
 const filename=[date,'IYOTENI',category,title].map(x=>String(x).replace(/[\\/\u0000-\u001f]/g,'_').slice(0,100)).join('_')+'.'+ext;
 const meta={name:filename,mimeType:type}; // マイドライブ直下。共有権限は追加しない。
 const init=await checkedResponse(await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink', {method:'POST',signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':type,'X-Upload-Content-Length':String(file.size)},body:JSON.stringify(meta)}));
 const location=init.headers.get('Location');if(!location)throw Error('アップロード先を取得できませんでした。');const url=new URL(location);if(url.protocol!=='https:'||url.hostname!=='www.googleapis.com')throw Error('アップロード先が不正です。');
 const result=await new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('PUT',url.href);x.setRequestHeader('Authorization','Bearer '+token);x.setRequestHeader('Content-Type',type);x.setRequestHeader('Content-Range',`bytes 0-${file.size-1}/${file.size}`);x.timeout=20*60*1000;
 const abort=()=>x.abort();if(signal?.aborted)return reject(Error('アップロードを中止しました'));signal?.addEventListener('abort',abort,{once:true});x.onloadend=()=>signal?.removeEventListener('abort',abort);
 x.upload.onprogress=e=>{if(e.lengthComputable)progress(Math.min(99,Math.round(e.loaded/e.total*100)))};
 x.onload=()=>{if(x.status>=200&&x.status<300){try{resolve(JSON.parse(x.responseText))}catch{reject(Error('保存結果を確認できません。Driveを確認してください。'))}}else reject(Error('動画の送信に失敗しました ('+x.status+')。再試行前にDriveを確認してください。'))};x.onerror=()=>reject(Error('通信が中断しました。再試行前にDriveを確認してください。'));x.ontimeout=()=>reject(Error('通信がタイムアウトしました。再試行前にDriveを確認してください。'));x.onabort=()=>reject(Error('アップロードを中止しました'));x.send(file)});
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(result.id||''))throw Error('保存先のIDを確認できません。Driveを確認してください。');progress(100);return {url:'https://drive.google.com/file/d/'+result.id+'/view',type};
}
