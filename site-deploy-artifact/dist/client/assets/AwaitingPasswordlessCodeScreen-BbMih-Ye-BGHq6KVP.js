import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{K as r,V as i,Y as a,gt as o,o as s,st as c}from"./events-context-BJ75xIIf-6KY42PM6.js";import"./eventemitter3-FS3ByYA1.js";import"./index-wGOlH2Wi-BSBRX8cq.js";import"./toViemAccount-Cy6jgXI2-BSGGclUh.js";import{C as l,v as u}from"./context-DEETNFc9-CEbnmTaX.js";import{t as d}from"./modal-context-BAV3sQpp-Bc9SzOez.js";import{D as f}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{t as p}from"./ScreenLayout-Yoa2TSpi-CHz-36XH.js";import{t as m}from"./shouldProceedtoEmbeddedWalletCreationFlow-BMHEqcS9-DG-YewmU.js";import{t as h}from"./EnvelopeIcon-D_5UkSAt.js";import{t as g}from"./PhoneIcon-Cpnjx0Fg.js";import{t as _}from"./Link-DJ5gq9Di-BmEExckH.js";import{s as v}from"./Layouts-BlFm53ED-CDCuovI9.js";var y=n(),b=e(t());function x({title:e,titleId:t,...n},r){return b.createElement(`svg`,Object.assign({xmlns:`http://www.w3.org/2000/svg`,viewBox:`0 0 20 20`,fill:`currentColor`,"aria-hidden":`true`,"data-slot":`icon`,ref:r,"aria-labelledby":t},n),e?b.createElement(`title`,{id:t},e):null,b.createElement(`path`,{fillRule:`evenodd`,d:`M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z`,clipRule:`evenodd`}))}var S=b.forwardRef(x),C=e(s(),1),w=({contactMethod:e,authFlow:t,emailDomain:n,appName:r=`Privy`,whatsAppEnabled:i=!1,onBack:a,onCodeSubmit:o,onResend:s,errorMessage:c,success:l=!1,resendCountdown:u=0,onInvalidInput:d,onClearError:f})=>{let[m,x]=(0,b.useState)(E);(0,b.useEffect)((()=>{c||x(E)}),[c]);let w=async e=>{e.preventDefault();let t=e.currentTarget.value.replace(` `,``);if(t===``)return;if(isNaN(Number(t)))return void d?.(`Code should be numeric`);f?.();let n=Number(e.currentTarget.name?.charAt(5)),r=[...t||[``]].slice(0,T-n),i=[...m.slice(0,n),...r,...m.slice(n+r.length)];x(i);let a=Math.min(Math.max(n+r.length,0),T-1);isNaN(Number(e.currentTarget.value))||document.querySelector(`input[name=code-${a}]`)?.focus(),i.every((e=>e&&!isNaN(+e)))&&(document.querySelector(`input[name=code-${a}]`)?.blur(),await o?.(i.join(``)))};return(0,y.jsx)(p,{title:`Enter confirmation code`,subtitle:(0,y.jsxs)(`span`,t===`email`?{children:[`Please check `,(0,y.jsx)(L,{children:e}),` for an email from`,` `,n??`privy.io`,` and enter your code below.`]}:{children:[`Please check `,(0,y.jsx)(L,{children:e}),` for a`,i?` WhatsApp`:``,` message from `,r,` and enter your code below.`]}),icon:t===`email`?h:g,onBack:a,showBack:!0,helpText:(0,y.jsxs)(F,{children:[(0,y.jsxs)(`span`,{children:[`Didn't get `,t===`email`?`an email`:`a message`,`?`]}),u?(0,y.jsxs)(I,{children:[(0,y.jsx)(S,{color:`var(--privy-color-foreground)`,strokeWidth:1.33,height:`12px`,width:`12px`}),(0,y.jsx)(`span`,{children:`Code sent`})]}):(0,y.jsx)(_,{as:`button`,size:`sm`,onClick:s,children:`Resend code`})]}),children:(0,y.jsx)(M,{children:(0,y.jsx)(v,{children:(0,y.jsxs)(N,{children:[(0,y.jsx)(`div`,{children:m.map(((e,t)=>(0,y.jsx)(`input`,{name:`code-${t}`,type:`text`,value:m[t],onChange:w,onKeyUp:e=>{e.key===`Backspace`&&(e=>{f?.(),x([...m.slice(0,e),``,...m.slice(e+1)]),e>0&&document.querySelector(`input[name=code-${e-1}]`)?.focus()})(t)},inputMode:`numeric`,autoFocus:t===0,pattern:`[0-9]`,className:`${l?`success`:``} ${c?`fail`:``}`,autoComplete:C.isMobile?`one-time-code`:`off`},t)))}),(0,y.jsx)(P,{$fail:!!c,$success:l,children:(0,y.jsx)(`span`,{children:c===`Invalid or expired verification code`?`Incorrect code`:c||(l?`Success!`:``)})})]})})})})},T=6,E=[,,,,,,].fill(``),D,O,k=((D=k||{})[D.RESET_AFTER_DELAY=0]=`RESET_AFTER_DELAY`,D[D.CLEAR_ON_NEXT_VALID_INPUT=1]=`CLEAR_ON_NEXT_VALID_INPUT`,D),A=((O=A||{})[O.EMAIL=0]=`EMAIL`,O[O.SMS=1]=`SMS`,O),j={component:()=>{let{navigate:e,lastScreen:t,navigateBack:n,setModalData:s,onUserCloseViaDialogOrKeybindRef:f}=d(),p=l(),{closePrivyModal:h,resendEmailCode:g,resendSmsCode:_,getAuthMeta:v,loginWithCode:x,updateWallets:S,createAnalyticsEvent:C}=o(),{authenticated:T,logout:E,user:D}=c(),{whatsAppEnabled:O}=l(),[k,A]=(0,b.useState)(!1),[j,M]=(0,b.useState)(null),[N,P]=(0,b.useState)(null),[F,I]=(0,b.useState)(0);f.current=()=>null;let L=+!v()?.email,R=L===0?v()?.email||``:v()?.phoneNumber||``,z=u-500;return(0,b.useEffect)((()=>{if(F){let e=setTimeout((()=>{I(F-1)}),1e3);return()=>clearTimeout(e)}}),[F]),(0,b.useEffect)((()=>{if(T&&k&&D){if(p?.legal.requireUsersAcceptTerms&&!D.hasAcceptedTerms){let t=setTimeout((()=>{e(`AffirmativeConsentScreen`)}),z);return()=>clearTimeout(t)}if(m(D,p.embeddedWallets)){let t=setTimeout((()=>{s({createWallet:{onSuccess:()=>{},onFailure:e=>{console.error(e),C({eventName:`embedded_wallet_creation_failure_logout`,payload:{error:e,screen:`AwaitingPasswordlessCodeScreen`}}),E()},callAuthOnSuccessOnClose:!0}}),e(`EmbeddedWalletOnAccountCreateScreen`)}),z);return()=>clearTimeout(t)}{S();let e=setTimeout((()=>h({shouldCallAuthOnSuccess:!0,isSuccess:!0})),u);return()=>clearTimeout(e)}}}),[T,k,D]),(0,b.useEffect)((()=>{if(j&&N===0){let e=setTimeout((()=>{M(null),P(null),document.querySelector(`input[name=code-0]`)?.focus()}),1400);return()=>clearTimeout(e)}}),[j,N]),(0,y.jsx)(w,{contactMethod:R,authFlow:L===0?`email`:`sms`,emailDomain:p?.appearance.emailDomain,appName:p?.name,whatsAppEnabled:O,onBack:()=>n(),onCodeSubmit:async n=>{try{await x(n),A(!0)}catch(n){if(n instanceof a&&n.privyErrorCode===r.INVALID_CREDENTIALS)M(`Invalid or expired verification code`),P(0);else if(n instanceof a&&n.privyErrorCode===r.CANNOT_LINK_MORE_OF_TYPE)M(n.message);else{if(n instanceof a&&n.privyErrorCode===r.USER_LIMIT_REACHED)return console.error(new i(n).toString()),void e(`UserLimitReachedScreen`);if(n instanceof a&&n.privyErrorCode===r.USER_DOES_NOT_EXIST)return void e(`AccountNotFoundScreen`);if(n instanceof a&&n.privyErrorCode===r.LINKED_TO_ANOTHER_USER)return s({errorModalData:{error:n,previousScreen:t??`AwaitingPasswordlessCodeScreen`}}),void e(`ErrorScreen`,!1);if(n instanceof a&&n.privyErrorCode===r.DISALLOWED_PLUS_EMAIL)return s({inlineError:{error:n}}),void e(`ConnectOrCreateScreen`,!1);if(n instanceof a&&n.privyErrorCode===r.ACCOUNT_TRANSFER_REQUIRED&&n.data?.data?.nonce)return s({accountTransfer:{nonce:n.data?.data?.nonce,account:R,displayName:n.data?.data?.account?.displayName,linkMethod:L===0?`email`:`sms`,embeddedWalletAddress:n.data?.data?.otherUser?.embeddedWalletAddress}}),void e(`LinkConflictScreen`);M(`Issue verifying code`),P(0)}}},onResend:async()=>{I(30),L===0?await g():await _()},errorMessage:j||void 0,success:k,resendCountdown:F,onInvalidInput:e=>{M(e),P(1)},onClearError:()=>{N===1&&(M(null),P(null))}})}},M=f.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: auto;
  gap: 16px;
  flex-grow: 1;
  width: 100%;
`,N=f.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 12px;

  > div:first-child {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    border-radius: var(--privy-border-radius-sm);

    > input {
      border: 1px solid var(--privy-color-foreground-4);
      background: var(--privy-color-background);
      border-radius: var(--privy-border-radius-sm);
      padding: 8px 10px;
      height: 48px;
      width: 40px;
      text-align: center;
      font-size: 18px;
      font-weight: 600;
      color: var(--privy-color-foreground);
      transition: all 0.2s ease;
    }

    > input:focus {
      border: 1px solid var(--privy-color-foreground);
      box-shadow: 0 0 0 1px var(--privy-color-foreground);
    }

    > input:invalid {
      border: 1px solid var(--privy-color-error);
    }

    > input.success {
      border: 1px solid var(--privy-color-border-success);
      background: var(--privy-color-success-bg);
    }

    > input.fail {
      border: 1px solid var(--privy-color-border-error);
      background: var(--privy-color-error-bg);
      animation: shake 180ms;
      animation-iteration-count: 2;
    }
  }

  @keyframes shake {
    0% {
      transform: translate(1px, 0px);
    }
    33% {
      transform: translate(-1px, 0px);
    }
    67% {
      transform: translate(-1px, 0px);
    }
    100% {
      transform: translate(1px, 0px);
    }
  }
`,P=f.div`
  line-height: 20px;
  min-height: 20px;
  font-size: 14px;
  font-weight: 400;
  color: ${e=>e.$success?`var(--privy-color-success-dark)`:e.$fail?`var(--privy-color-error-dark)`:`transparent`};
  display: flex;
  justify-content: center;
  width: 100%;
  text-align: center;
`,F=f.div`
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: var(--privy-color-foreground-2);
`,I=f.div`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--privy-border-radius-sm);
  padding: 2px 8px;
  gap: 4px;
  background: var(--privy-color-background-2);
  color: var(--privy-color-foreground-2);
`,L=f.span`
  font-weight: 500;
  word-break: break-all;
  color: var(--privy-color-foreground);
`;export{j as AwaitingPasswordlessCodeScreen,j as default,w as AwaitingPasswordlessCodeScreenView};