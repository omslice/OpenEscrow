import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{gt as r,o as i}from"./events-context-BJ75xIIf-6KY42PM6.js";import"./eventemitter3-FS3ByYA1.js";import{C as a}from"./context-DEETNFc9-CEbnmTaX.js";import{t as o}from"./modal-context-BAV3sQpp-Bc9SzOez.js";import{D as s}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{l as c,r as l,t as u,u as d}from"./ModalHeader-CAqKnddp-BOAYq9Ae.js";import{t as f}from"./ExclamationCircleIcon-DuHDRtX6.js";import{t as p}from"./ExclamationTriangleIcon-C7LEu7jk.js";import{t as m}from"./WalletIcon-BgKxkAFX.js";import{t as h}from"./Address-BNlptHuN-DzxONsPA.js";import{t as g}from"./StackedContainer-B2vaEl56-CpGHOtEr.js";import{t as _}from"./capitalizeFirstLetter-DmLYqXsO-DtOXx-2n.js";var v=n(),y=e(t());function b({title:e,titleId:t,...n},r){return y.createElement(`svg`,Object.assign({xmlns:`http://www.w3.org/2000/svg`,fill:`none`,viewBox:`0 0 24 24`,strokeWidth:1.5,stroke:`currentColor`,"aria-hidden":`true`,"data-slot":`icon`,ref:r,"aria-labelledby":t},n),e?y.createElement(`title`,{id:t},e):null,y.createElement(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,d:`M16.5 8.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v8.25A2.25 2.25 0 0 0 6 16.5h2.25m8.25-8.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-7.5A2.25 2.25 0 0 1 8.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 0 0-2.25 2.25v6`}))}var x=y.forwardRef(b);i();var S=s.span`
  && {
    width: 82px;
    height: 82px;
    border-width: 4px;
    border-style: solid;
    border-color: ${e=>e.color??`var(--privy-color-accent)`};
    border-bottom-color: transparent;
    border-radius: 50%;
    display: inline-block;
    box-sizing: border-box;
    animation: rotation 1.2s linear infinite;
    transition: border-color 800ms;
    border-bottom-color: ${e=>e.color??`var(--privy-color-accent)`};
  }
`;function C(e){return(0,v.jsxs)(`svg`,{xmlns:`http://www.w3.org/2000/svg`,width:`24`,height:`24`,viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,"stroke-width":`2`,"stroke-linecap":`round`,"stroke-linejoin":`round`,...e,children:[(0,v.jsx)(`circle`,{cx:`12`,cy:`12`,r:`10`}),(0,v.jsx)(`line`,{x1:`12`,x2:`12`,y1:`8`,y2:`12`}),(0,v.jsx)(`line`,{x1:`12`,x2:`12.01`,y1:`16`,y2:`16`})]})}var w=({onTransfer:e,isTransferring:t,transferSuccess:n})=>(0,v.jsx)(c,{...n?{success:!0,children:`Success!`}:{warn:!0,loading:t,onClick:e,children:`Transfer and delete account`}}),T=s.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding-bottom: 16px;
`,E=s.div`
  display: flex;
  flex-direction: column;
  && p {
    font-size: 14px;
  }
  width: 100%;
  gap: 16px;
`,D=s.div`
  display: flex;
  cursor: pointer;
  align-items: center;
  width: 100%;
  border: 1px solid var(--privy-color-foreground-4) !important;
  border-radius: var(--privy-border-radius-md);
  padding: 8px 10px;
  font-size: 14px;
  font-weight: 500;
  gap: 8px;
`,O=s(f)`
  position: relative;
  width: ${({$iconSize:e})=>`${e}px`};
  height: ${({$iconSize:e})=>`${e}px`};
  color: var(--privy-color-foreground-3);
  margin-left: auto;
`,k=s(x)`
  position: relative;
  width: 15px;
  height: 15px;
  color: var(--privy-color-foreground-3);
  margin-left: auto;
`,A=s.ol`
  display: flex;
  flex-direction: column;
  font-size: 14px;
  width: 100%;
  text-align: left;
`,j=s.li`
  font-size: 14px;
  list-style-type: auto;
  list-style-position: outside;
  margin-left: 1rem;
  margin-bottom: 0.5rem; /* Adjust the margin as needed */

  &:last-child {
    margin-bottom: 0; /* Remove margin from the last item */
  }
`,M=s.div`
  position: relative;
  width: 60px;
  height: 60px;
  margin: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
`,N=()=>(0,v.jsx)(M,{children:(0,v.jsx)(O,{$iconSize:60})}),P=({address:e,onClose:t,onRetry:n,onTransfer:r,isTransferring:i,transferSuccess:o})=>{let{defaultChain:s}=a(),c=s.blockExplorers?.default.url??`https://etherscan.io`;return(0,v.jsxs)(v.Fragment,{children:[(0,v.jsx)(l,{onClose:t,backFn:n}),(0,v.jsxs)(T,{children:[(0,v.jsx)(N,{}),(0,v.jsxs)(E,{children:[(0,v.jsx)(`h3`,{children:`Check account assets before transferring`}),(0,v.jsx)(`p`,{children:`Before transferring, ensure there are no assets in the other account. Assets in that account will not transfer automatically and may be lost.`}),(0,v.jsxs)(A,{children:[(0,v.jsx)(`p`,{children:` To check your balance, you can:`}),(0,v.jsx)(j,{children:`Log out and log back into the other account, or `}),(0,v.jsxs)(j,{children:[`Copy your wallet address and use a`,` `,(0,v.jsx)(`u`,{children:(0,v.jsx)(`a`,{target:`_blank`,href:c,children:`block explorer`})}),` `,`to see if the account holds any assets.`]})]}),(0,v.jsxs)(D,{onClick:()=>navigator.clipboard.writeText(e).catch(console.error),children:[(0,v.jsx)(m,{color:`var(--privy-color-foreground-1)`,strokeWidth:2,height:`28px`,width:`28px`}),(0,v.jsx)(h,{address:e,showCopyIcon:!1}),(0,v.jsx)(k,{})]}),(0,v.jsx)(w,{onTransfer:r,isTransferring:i,transferSuccess:o})]})]}),(0,v.jsx)(d,{})]})},F={component:()=>{let{initiateAccountTransfer:e,closePrivyModal:t}=r(),{data:n,navigate:i,lastScreen:a,setModalData:s}=o(),[c,l]=(0,y.useState)(void 0),[u,d]=(0,y.useState)(!1),[f,p]=(0,y.useState)(!1),m=async()=>{try{if(!n?.accountTransfer?.nonce||!n?.accountTransfer?.account)throw Error(`missing account transfer inputs`);p(!0),await e({nonce:n?.accountTransfer?.nonce,account:n?.accountTransfer?.account,accountType:n?.accountTransfer?.linkMethod,externalWalletMetadata:n?.accountTransfer?.externalWalletMetadata,telegramWebAppData:n?.accountTransfer?.telegramWebAppData,telegramAuthResult:n?.accountTransfer?.telegramAuthResult,farcasterEmbeddedAddress:n?.accountTransfer?.farcasterEmbeddedAddress,oAuthUserInfo:n?.accountTransfer?.oAuthUserInfo}),d(!0),p(!1),setTimeout(t,1e3)}catch(e){s({errorModalData:{error:e,previousScreen:a||`LinkConflictScreen`}}),i(`ErrorScreen`,!0)}};return c?(0,v.jsx)(P,{address:c,onClose:t,onRetry:()=>l(void 0),onTransfer:m,isTransferring:f,transferSuccess:u}):(0,v.jsx)(I,{onClose:t,onInfo:()=>l(n?.accountTransfer?.embeddedWalletAddress),onContinue:()=>l(n?.accountTransfer?.embeddedWalletAddress),onTransfer:m,isTransferring:f,transferSuccess:u,data:n})}},I=({onClose:e,onContinue:t,onInfo:n,onTransfer:r,transferSuccess:i,isTransferring:a,data:o})=>{if(!o?.accountTransfer?.linkMethod||!o?.accountTransfer?.displayName)return;let s={method:o?.accountTransfer?.linkMethod,handle:o?.accountTransfer?.displayName,disclosedAccount:o?.accountTransfer?.embeddedWalletAddress?{type:`wallet`,handle:o?.accountTransfer?.embeddedWalletAddress}:void 0};return(0,v.jsxs)(v.Fragment,{children:[(0,v.jsx)(l,{closeable:!0}),(0,v.jsxs)(T,{children:[(0,v.jsx)(g,{children:(0,v.jsxs)(`div`,{children:[(0,v.jsx)(S,{color:`var(--privy-color-error)`}),(0,v.jsx)(p,{height:38,width:38,stroke:`var(--privy-color-error)`})]})}),(0,v.jsxs)(E,{children:[(0,v.jsxs)(`h3`,{children:[function(e){switch(e){case`sms`:return`Phone number`;case`email`:return`Email address`;case`siwe`:return`Wallet address`;case`siws`:return`Solana wallet address`;case`linkedin`:return`LinkedIn profile`;case`google`:case`apple`:case`discord`:case`github`:case`instagram`:case`spotify`:case`tiktok`:case`line`:case`twitch`:case`twitter`:case`telegram`:case`farcaster`:return`${_(e.replace(`_oauth`,``))} profile`;default:return e.startsWith(`privy:`)?`Cross-app account`:e}}(s.method),` is associated with another account`]}),(0,v.jsxs)(`p`,{children:[`Do you want to transfer`,(0,v.jsx)(`b`,{children:s.handle?` ${s.handle}`:``}),` to this account instead? This will delete your other account.`]}),(0,v.jsx)(L,{onClick:n,disclosedAccount:s.disclosedAccount})]}),(0,v.jsxs)(E,{style:{gap:12,marginTop:12},children:[o?.accountTransfer?.embeddedWalletAddress?(0,v.jsx)(c,{onClick:t,children:`Continue`}):(0,v.jsx)(w,{onTransfer:r,transferSuccess:i,isTransferring:a}),(0,v.jsx)(u,{onClick:e,children:`No thanks`})]})]}),(0,v.jsx)(d,{})]})};function L({disclosedAccount:e,onClick:t}){return e?(0,v.jsxs)(D,{onClick:t,children:[(0,v.jsx)(m,{color:`var(--privy-color-foreground-1)`,strokeWidth:2,height:`28px`,width:`28px`}),(0,v.jsx)(h,{address:e.handle,showCopyIcon:!1}),(0,v.jsx)(C,{width:15,height:15,color:`var(--privy-color-foreground-3)`,style:{marginLeft:`auto`}})]}):null}export{F as LinkConflictScreen,F as default,I as LinkConflictScreenView};