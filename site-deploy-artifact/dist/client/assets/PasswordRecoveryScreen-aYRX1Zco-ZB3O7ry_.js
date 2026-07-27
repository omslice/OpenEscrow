import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{Q as r,gt as i,o as a,st as o,tt as s}from"./events-context-BJ75xIIf-6KY42PM6.js";import"./eventemitter3-FS3ByYA1.js";import{s as c}from"./index-wGOlH2Wi-BSBRX8cq.js";import"./toViemAccount-Cy6jgXI2-BSGGclUh.js";import"./context-DEETNFc9-CEbnmTaX.js";import{t as l}from"./modal-context-BAV3sQpp-Bc9SzOez.js";import{D as u,E as d}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{l as f}from"./ModalHeader-CAqKnddp-BOAYq9Ae.js";import{t as p}from"./Screen-CLdp3cO6-BF8oNK7i.js";import{a as m,d as h,n as g,o as _,s as v}from"./shared-Cwq8m_h6-D5sJTQWV.js";import{t as y}from"./ShieldCheckIcon-CkHsdO4F.js";import{a as b}from"./Layouts-BlFm53ED-CDCuovI9.js";var x=n(),S=e(t(),1);a();var C={component:()=>{let[e,t]=(0,S.useState)(!0),{authenticated:n,user:a}=o(),{walletProxy:u,closePrivyModal:d,createAnalyticsEvent:f,client:C}=i(),{navigate:D,data:O,onUserCloseViaDialogOrKeybindRef:k}=l(),[A,j]=(0,S.useState)(void 0),[M,N]=(0,S.useState)(``),[P,F]=(0,S.useState)(!1),{entropyId:I,entropyIdVerifier:L,onCompleteNavigateTo:R,onSuccess:z,onFailure:B}=O.recoverWallet,V=(e=`User exited before their wallet could be recovered`)=>{d({shouldCallAuthOnSuccess:!1}),B(typeof e==`string`?new r(e):e)};return k.current=V,(0,S.useEffect)((()=>{if(!n)return V(`User must be authenticated and have a Privy wallet before it can be recovered`)}),[n]),(0,x.jsxs)(p,{children:[(0,x.jsx)(p.Header,{icon:y,title:`Enter your password`,subtitle:`Please provision your account on this new device. To continue, enter your recovery password.`,showClose:!0,onClose:V}),(0,x.jsx)(p.Body,{children:(0,x.jsx)(w,{children:(0,x.jsxs)(`div`,{children:[(0,x.jsxs)(m,{children:[(0,x.jsx)(_,{type:e?`password`:`text`,onChange:e=>(e=>{e&&j(e)})(e.target.value),disabled:P,style:{paddingRight:`2.3rem`}}),(0,x.jsx)(h,{style:{right:`0.75rem`},children:e?(0,x.jsx)(g,{onClick:()=>t(!1)}):(0,x.jsx)(v,{onClick:()=>t(!0)})})]}),!!M&&(0,x.jsx)(T,{children:M})]})})}),(0,x.jsxs)(p.Footer,{children:[(0,x.jsx)(p.HelpText,{children:(0,x.jsxs)(b,{children:[(0,x.jsx)(`h4`,{children:`Why is this necessary?`}),(0,x.jsx)(`p`,{children:`You previously set a password for this wallet. This helps ensure only you can access it`})]})}),(0,x.jsx)(p.Actions,{children:(0,x.jsx)(E,{loading:P||!u,disabled:!A,onClick:async()=>{F(!0);let e=await C.getAccessToken(),t=s(a,I);if(!e||!t||A===null)return V(`User must be authenticated and have a Privy wallet before it can be recovered`);try{f({eventName:`embedded_wallet_recovery_started`,payload:{walletAddress:t.address}}),await u?.recover({accessToken:e,entropyId:I,entropyIdVerifier:L,recoveryPassword:A}),N(``),R?D(R):d({shouldCallAuthOnSuccess:!1}),z?.(t),f({eventName:`embedded_wallet_recovery_completed`,payload:{walletAddress:t.address}})}catch(e){c(e)?N(`Invalid recovery password, please try again.`):N(`An error has occurred, please try again.`)}finally{F(!1)}},$hideAnimations:!I&&P,children:`Recover your account`})}),(0,x.jsx)(p.Watermark,{})]})]})}},w=u.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`,T=u.div`
  line-height: 20px;
  height: 20px;
  font-size: 13px;
  color: var(--privy-color-error);
  text-align: left;
  margin-top: 0.5rem;
`,E=u(f)`
  ${({$hideAnimations:e})=>e&&d`
      && {
        // Remove animations because the recoverWallet task on the iframe partially
        // blocks the renderer, so the animation stutters and doesn't look good
        transition: none;
      }
    `}
`;export{C as PasswordRecoveryScreen,C as default};