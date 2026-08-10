import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{gt as r,o as i}from"./events-context-BJ75xIIf-6KY42PM6.js";import"./eventemitter3-FS3ByYA1.js";import{C as a,v as o}from"./context-DEETNFc9-CEbnmTaX.js";import{t as s}from"./modal-context-BAV3sQpp-Bc9SzOez.js";import{D as c,x as l}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{t as u}from"./ScreenLayout-Yoa2TSpi-CHz-36XH.js";import{n as d,t as f}from"./QrCode-BV7KfzAf-CcN1rxtJ.js";import{t as p}from"./farcaster-DPlSjvF5-DrRtmdvs.js";import{t as m}from"./OpenLink-DZHy38vr-BeIWdFGg.js";import{t as h}from"./CopyToClipboard-DSTf_eKU-Cy3_xFFT.js";var g=n(),_=e(t(),1),v=e(i(),1);d();var y=`#8a63d2`,b=({appName:e,loading:t,success:n,errorMessage:r,connectUri:i,onBack:a,onClose:o,onOpenFarcaster:s})=>(0,g.jsx)(u,v.isMobile||t?v.isIOS?{title:r?r.message:`Add a signer to Farcaster`,subtitle:r?r.detail:`This will allow ${e} to add casts, likes, follows, and more on your behalf.`,icon:p,iconVariant:`loading`,iconLoadingStatus:{success:n,fail:!!r},primaryCta:i&&s?{label:`Open Farcaster app`,onClick:s}:void 0,onBack:a,onClose:o,watermark:!0}:{title:r?r.message:`Requesting signer from Farcaster`,subtitle:r?r.detail:`This should only take a moment`,icon:p,iconVariant:`loading`,iconLoadingStatus:{success:n,fail:!!r},onBack:a,onClose:o,watermark:!0,children:i&&v.isMobile&&(0,g.jsx)(x,{children:(0,g.jsx)(m,{text:`Take me to Farcaster`,url:i,color:y})})}:{title:`Add a signer to Farcaster`,subtitle:`This will allow ${e} to add casts, likes, follows, and more on your behalf.`,onBack:a,onClose:o,watermark:!0,children:(0,g.jsxs)(S,{children:[(0,g.jsx)(C,{children:i?(0,g.jsx)(f,{url:i,size:275,squareLogoElement:p}):(0,g.jsx)(E,{children:(0,g.jsx)(l,{})})}),(0,g.jsxs)(w,{children:[(0,g.jsx)(T,{children:`Or copy this link and paste it into a phone browser to open the Farcaster app.`}),i&&(0,g.jsx)(h,{text:i,itemName:`link`,color:y})]})]})}),x=c.div`
  margin-top: 24px;
`,S=c.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`,C=c.div`
  padding: 24px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 275px;
`,w=c.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`,T=c.div`
  font-size: 0.875rem;
  text-align: center;
  color: var(--privy-color-foreground-2);
`,E=c.div`
  position: relative;
  width: 82px;
  height: 82px;
`,D={component:()=>{let{lastScreen:e,navigateBack:t,data:n}=s(),i=a(),{requestFarcasterSignerStatus:c,closePrivyModal:l}=r(),[u,d]=(0,_.useState)(void 0),[f,p]=(0,_.useState)(!1),[m,h]=(0,_.useState)(!1),v=(0,_.useRef)([]),y=n?.farcasterSigner;(0,_.useEffect)((()=>{let e=Date.now(),t=setInterval((async()=>{if(!y?.public_key)return clearInterval(t),void d({retryable:!0,message:`Connect failed`,detail:`Something went wrong. Please try again.`});y.status===`approved`&&(clearInterval(t),p(!1),h(!0),v.current.push(setTimeout((()=>l({shouldCallAuthOnSuccess:!1,isSuccess:!0})),1400)));let n=await c(y?.public_key),r=Date.now()-e;n.status===`approved`?(clearInterval(t),p(!1),h(!0),v.current.push(setTimeout((()=>l({shouldCallAuthOnSuccess:!1,isSuccess:!0})),o))):r>3e5?(clearInterval(t),d({retryable:!0,message:`Connect failed`,detail:`The request timed out. Try again.`})):n.status===`revoked`&&(clearInterval(t),d({retryable:!0,message:`Request rejected`,detail:`The request was rejected. Please try again.`}))}),2e3);return()=>{clearInterval(t),v.current.forEach((e=>clearTimeout(e)))}}),[]);let x=y?.status===`pending_approval`?y.signer_approval_url:void 0;return(0,g.jsx)(b,{appName:i.name,loading:f,success:m,errorMessage:u,connectUri:x,onBack:e?t:void 0,onClose:l,onOpenFarcaster:()=>{x&&(window.location.href=x)}})}};export{D as FarcasterSignerStatusScreen,D as default,b as FarcasterSignerStatusView};