import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{o as r,st as i}from"./events-context-BJ75xIIf-6KY42PM6.js";import"./eventemitter3-FS3ByYA1.js";import{P as a}from"./index-wGOlH2Wi-BSBRX8cq.js";import"./toViemAccount-Cy6jgXI2-BSGGclUh.js";import"./context-DEETNFc9-CEbnmTaX.js";import{d as o}from"./usePrivy-WvWzevM9-CNbHvQKu.js";import{n as s}from"./chevron-down-DBDGRTRA.js";import{t as c}from"./modal-context-BAV3sQpp-Bc9SzOez.js";import{D as l}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{t as u}from"./createLucideIcon-BT_gG4fs.js";import{t as d}from"./check-BKf5mJO2.js";import{t as f}from"./circle-x-lZV95bZY.js";import{t as p}from"./hourglass-ZSpIS4pS.js";import{t as m}from"./ScreenLayout-Yoa2TSpi-CHz-36XH.js";import{t as h}from"./InfoBanner-DkQEPd77-B_UqaCTT.js";import{n as g}from"./CopyableText-ChtfBWx4-Dhq-oFur.js";import{n as _,r as v,t as y}from"./SelectSourceAsset-CgO1cpz4-DeCoeerR.js";var b=u(`user-check`,[[`path`,{d:`m16 11 2 2 4-4`,key:`9rsbq5`}],[`path`,{d:`M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2`,key:`1yyitq`}],[`circle`,{cx:`9`,cy:`7`,r:`4`,key:`nufk8`}]]),x=n(),S=e(t(),1),C=e(r(),1),w=e=>{try{return e.location.origin}catch{return}},T=({data:e,onClose:t})=>(0,x.jsx)(m,{showClose:!0,onClose:t,title:`Initiate bank transfer`,subtitle:`Use the details below to complete a bank transfer from your bank.`,primaryCta:{label:`Done`,onClick:t},watermark:!1,footerText:`Exchange rates and fees are set when you authorize and determine the amount you receive. You'll see the applicable rates and fees for your transaction separately`,children:(0,x.jsx)(E,{children:(a[e.deposit_instructions.asset]||[]).map((([t,n],r)=>{let i=e.deposit_instructions[t];if(!i||Array.isArray(i))return null;let a=t===`asset`?i.toUpperCase():i,o=a.length>100?`${a.slice(0,9)}...${a.slice(-9)}`:a;return(0,x.jsxs)(D,{children:[(0,x.jsx)(O,{children:n}),(0,x.jsx)(g,{value:a,includeChildren:C.isMobile,children:(0,x.jsx)(k,{children:o})})]},r)}))})}),E=l.ol`
  border-color: var(--privy-color-border-default);
  border-width: 1px;
  border-radius: var(--privy-border-radius-mdlg);
  border-style: solid;
  display: flex;
  flex-direction: column;

  && {
    padding: 0 1rem;
  }
`,D=l.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;

  &:not(:first-of-type) {
    border-top: 1px solid var(--privy-color-border-default);
  }

  & > {
    :nth-child(1) {
      flex-basis: 30%;
    }

    :nth-child(2) {
      flex-basis: 60%;
    }
  }
`,O=l.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-variant-numeric: lining-nums proportional-nums;
  font-feature-settings: 'calt' off;

  /* text-xs/font-regular */
  font-size: 0.75rem;
  font-style: normal;
  font-weight: 400;
  line-height: 1.125rem; /* 150% */

  text-align: left;
  flex-shrink: 0;
`,k=l.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;

  /* text-sm/font-medium */
  font-size: 0.875rem;
  font-style: normal;
  font-weight: 500;
  line-height: 1.375rem; /* 157.143% */

  text-align: right;
  word-break: break-all;
`,A=({onClose:e})=>(0,x.jsx)(m,{showClose:!0,onClose:e,icon:f,iconVariant:`error`,title:`Something went wrong`,subtitle:`We couldn't complete account setup. This isn't caused by anything you did.`,primaryCta:{label:`Close`,onClick:e},watermark:!0}),j=({onClose:e,reason:t})=>{let n=t?t.charAt(0).toLowerCase()+t.slice(1):void 0;return(0,x.jsx)(m,{showClose:!0,onClose:e,icon:f,iconVariant:`error`,title:`Identity verification failed`,subtitle:n?`We can't complete identity verification because ${n}. Please try again or contact support for assistance.`:`We couldn't verify your identity. Please try again or contact support for assistance.`,primaryCta:{label:`Close`,onClick:e},watermark:!0})},M=({onClose:e,email:t})=>(0,x.jsx)(m,{showClose:!0,onClose:e,icon:p,title:`Identity verification in progress`,subtitle:`We're waiting for Persona to approve your identity verification. This usually takes a few minutes, but may take up to 24 hours.`,primaryCta:{label:`Done`,onClick:e},watermark:!0,children:(0,x.jsxs)(h,{theme:`light`,children:[`You'll receive an email at `,t,` once approved with instructions for completing your deposit.`]})}),N=({onClose:e,onAcceptTerms:t,isLoading:n})=>(0,x.jsx)(m,{showClose:!0,onClose:e,icon:b,title:`Verify your identity to continue`,subtitle:`Finish verification with Persona — it takes just a few minutes and requires a government ID.`,helpText:(0,x.jsxs)(x.Fragment,{children:[`This app uses Bridge to securely connect accounts and move funds. By clicking "Accept," you agree to Bridge's`,` `,(0,x.jsx)(`a`,{href:`https://www.bridge.xyz/legal`,target:`_blank`,rel:`noopener noreferrer`,children:`Terms of Service`}),` `,`and`,` `,(0,x.jsx)(`a`,{href:`https://www.bridge.xyz/legal/row-privacy-policy/bridge-building-limited`,target:`_blank`,rel:`noopener noreferrer`,children:`Privacy Policy`}),`.`]}),primaryCta:{label:`Accept and continue`,onClick:t,loading:n},watermark:!0}),P=({onClose:e})=>(0,x.jsx)(m,{showClose:!0,onClose:e,icon:d,iconVariant:`success`,title:`Identity verified successfully`,subtitle:`We've successfully verified your identity. Now initiate a bank transfer to view instructions.`,primaryCta:{label:`Initiate bank transfer`,onClick:()=>{},loading:!0},watermark:!0}),F=({opts:e,onClose:t,onEditSourceAsset:n,onSelectAmount:r,isLoading:i})=>(0,x.jsxs)(m,{showClose:!0,onClose:t,headerTitle:`Buy ${e.destination.asset.toLocaleUpperCase()}`,primaryCta:{label:`Continue`,onClick:r,loading:i},watermark:!0,children:[(0,x.jsx)(y,{currency:e.source.selectedAsset,inputMode:`decimal`,autoFocus:!0}),(0,x.jsx)(_,{selectedAsset:e.source.selectedAsset,onEditSourceAsset:n})]}),I=({onClose:e,onAcceptTerms:t,onSelectAmount:n,onSelectSource:r,onEditSourceAsset:i,opts:a,state:o,email:s,isLoading:c})=>o.status===`select-amount`?(0,x.jsx)(F,{onClose:e,onSelectAmount:n,onEditSourceAsset:i,opts:a,isLoading:c}):o.status===`select-source-asset`?(0,x.jsx)(v,{onSelectSource:r,opts:a,isLoading:c}):o.status===`kyc-prompt`?(0,x.jsx)(N,{onClose:e,onAcceptTerms:t,opts:a,isLoading:c}):o.status===`kyc-incomplete`?(0,x.jsx)(M,{onClose:e,email:s}):o.status===`kyc-success`?(0,x.jsx)(P,{onClose:e}):o.status===`kyc-error`?(0,x.jsx)(j,{onClose:e,reason:o.reason}):o.status===`account-details`?(0,x.jsx)(T,{onClose:e,data:o.data}):o.status===`create-customer-error`||o.status===`get-customer-error`?(0,x.jsx)(A,{onClose:e}):null,L={component:()=>{let{user:e}=i(),t=c().data;if(!t?.FundWithBankDepositScreen)throw Error(`Missing data`);let{onSuccess:n,onFailure:r,opts:a,createOrUpdateCustomer:l,getCustomer:u,getOrCreateVirtualAccount:d}=t.FundWithBankDepositScreen,[f,p]=(0,S.useState)(a),[m,h]=(0,S.useState)({status:`select-amount`}),[g,_]=(0,S.useState)(null),[v,y]=(0,S.useState)(!1),b=(0,S.useRef)(null),C=(0,S.useCallback)((async()=>{let e;y(!0),_(null);try{e=await u({kycRedirectUrl:window.location.origin})}catch(e){if(!e||typeof e!=`object`||!(`status`in e)||e.status!==404)return h({status:`get-customer-error`}),_(e),void y(!1)}if(!e)try{e=await l({hasAcceptedTerms:!1,kycRedirectUrl:window.location.origin})}catch(e){h({status:`create-customer-error`}),_(e),y(!1);return}if(!e)return h({status:`create-customer-error`}),_(Error(`Unable to create customer`)),void y(!1);if(e.status===`not_started`&&e.kyc_url)return h({status:`kyc-prompt`,kycUrl:e.kyc_url}),void y(!1);if(e.status===`not_started`)return h({status:`get-customer-error`}),_(Error(`Unexpected user state`)),void y(!1);if(e.status===`rejected`)return h({status:`kyc-error`,reason:e.rejection_reasons?.[0]?.reason}),_(Error(`User KYC rejected.`)),void y(!1);if(e.status===`incomplete`)return h({status:`kyc-incomplete`}),void y(!1);if(e.status!==`active`)return h({status:`get-customer-error`}),_(Error(`Unexpected user state`)),void y(!1);e.status;try{let e=await d({destination:f.destination,provider:f.provider,source:{asset:f.source.selectedAsset}});h({status:`account-details`,data:e})}catch(e){h({status:`create-customer-error`}),_(e),y(!1);return}}),[f]),T=(0,S.useCallback)((async()=>{if(_(null),y(!0),m.status!==`kyc-prompt`)return _(Error(`Unexpected state`)),void y(!1);let e=o({location:m.kycUrl});if(await l({hasAcceptedTerms:!0}),!e)return _(Error(`Unable to begin kyc flow.`)),y(!1),void h({status:`create-customer-error`});b.current=new AbortController;let t=await(async(e,t)=>{let n=await s({operation:async()=>({done:w(e)===window.location.origin,closed:e.closed}),until:({done:e,closed:t})=>e||t,delay:0,interval:500,attempts:360,signal:t});return n.status===`aborted`?(e.close(),{status:`aborted`}):n.status===`max_attempts`?{status:`timeout`}:n.result.done?(e.close(),{status:`redirected`}):{status:`closed`}})(e,b.current.signal);if(t.status===`aborted`)return;if(t.status===`closed`)return void y(!1);t.status;let n=await s({operation:()=>u({}),until:e=>e.status===`active`||e.status===`rejected`,delay:0,interval:2e3,attempts:60,signal:b.current.signal});if(n.status!==`aborted`){if(n.status===`max_attempts`)return h({status:`kyc-incomplete`}),void y(!1);if(n.status,n.result.status===`rejected`)return h({status:`kyc-error`,reason:n.result.rejection_reasons?.[0]?.reason}),_(Error(`User KYC rejected.`)),void y(!1);if(n.result.status!==`active`)return h({status:`kyc-incomplete`}),void y(!1);e.closed||e.close(),n.result.status;try{h({status:`kyc-success`});let e=await d({destination:f.destination,provider:f.provider,source:{asset:f.source.selectedAsset}});h({status:`account-details`,data:e})}catch(e){h({status:`create-customer-error`}),_(e)}finally{y(!1)}}}),[h,_,y,l,d,m,f,b]),E=(0,S.useCallback)((e=>{h({status:`select-amount`}),p({...f,source:{...f.source,selectedAsset:e}})}),[h,p]),D=(0,S.useCallback)((()=>{h({status:`select-source-asset`})}),[h]);return(0,x.jsx)(I,{onClose:(0,S.useCallback)((async()=>{b.current?.abort(),g?r(g):await n()}),[g,b]),opts:f,state:m,isLoading:v,email:e.email.address,onAcceptTerms:T,onSelectAmount:C,onSelectSource:E,onEditSourceAsset:D})}};export{L as FundWithBankDepositScreen,L as default};