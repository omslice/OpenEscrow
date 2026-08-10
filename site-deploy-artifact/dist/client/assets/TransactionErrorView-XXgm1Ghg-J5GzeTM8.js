import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{mn as r}from"./ccip-DNwZND7k.js";import{gt as i}from"./events-context-BJ75xIIf-6KY42PM6.js";import{Bt as a}from"./index-wGOlH2Wi-BSBRX8cq.js";import{C as o}from"./context-DEETNFc9-CEbnmTaX.js";import{t as s}from"./formatters-7MRJNbJ4.js";import{D as c,m as l}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{i as u,l as d,o as f,r as p,u as m}from"./ModalHeader-CAqKnddp-BOAYq9Ae.js";import{t as h}from"./ChevronDownIcon-Cqk5D6K_.js";import{n as g,t as _}from"./Checkbox-BhNoOKjX-BAh15F1I.js";import{t as v}from"./ExclamationCircleIcon-DuHDRtX6.js";import{t as y}from"./ErrorMessage-D8VaAP5m-BHdRttjr.js";import{a as b,i as x,n as S,r as ee,t as C}from"./Value-tcJV9e0L-Da3EjBQU.js";import{t as w}from"./LoadingSkeleton-U6-3yFwI-BJ5iPQ5k.js";import{t as te}from"./Subtitle-CV-2yKE4-DZMQmPUJ.js";import{t as T}from"./Title-BnzYV3Is-C1O3RxPi.js";import{t as E}from"./shared-FM0rljBt-D9yA8Cun.js";import{t as D}from"./Address-BNlptHuN-DzxONsPA.js";import{t as O}from"./LabelXs-oqZNqbm_-BLNNsRZQ.js";import{t as k}from"./WalletInfoCard-DCGeaps8-D9IM7pVL.js";import{t as A}from"./WarningBanner-D5LqDt95-BM4qw0RG.js";import{t as j}from"./ErrorBanner-CQERa7bL-CGbELHGe.js";var M=e(t());function N({title:e,titleId:t,...n},r){return M.createElement(`svg`,Object.assign({xmlns:`http://www.w3.org/2000/svg`,fill:`none`,viewBox:`0 0 24 24`,strokeWidth:1.5,stroke:`currentColor`,"aria-hidden":`true`,"data-slot":`icon`,ref:r,"aria-labelledby":t},n),e?M.createElement(`title`,{id:t},e):null,M.createElement(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,d:`M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3`}))}var ne=M.forwardRef(N);function P({title:e,titleId:t,...n},r){return M.createElement(`svg`,Object.assign({xmlns:`http://www.w3.org/2000/svg`,fill:`none`,viewBox:`0 0 24 24`,strokeWidth:1.5,stroke:`currentColor`,"aria-hidden":`true`,"data-slot":`icon`,ref:r,"aria-labelledby":t},n),e?M.createElement(`title`,{id:t},e):null,M.createElement(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,d:`m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z`}))}var re=M.forwardRef(P),F=n();function I({title:e,titleId:t,...n},r){return M.createElement(`svg`,Object.assign({xmlns:`http://www.w3.org/2000/svg`,fill:`none`,viewBox:`0 0 24 24`,strokeWidth:1.5,stroke:`currentColor`,"aria-hidden":`true`,"data-slot":`icon`,ref:r,"aria-labelledby":t},n),e?M.createElement(`title`,{id:t},e):null,M.createElement(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,d:`M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z`}))}var L=M.forwardRef(I),ie=c(C)`
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: var(--privy-color-accent);
  svg {
    fill: var(--privy-color-accent);
  }
`,R=({iconUrl:e,value:t,symbol:n,usdValue:r,nftName:i,nftCount:a,decimals:o,$isLoading:s})=>{if(s)return(0,F.jsx)(z,{$isLoading:s});let c=t&&r&&o?function(e,t,n){let r=parseFloat(e),i=parseFloat(n);if(r===0||i===0||Number.isNaN(r)||Number.isNaN(i))return e;let a=Math.ceil(-Math.log10(.01/(i/r))),o=10**(a=Math.max(a=Math.min(a,t),1)),s=+(Math.floor(r*o)/o).toFixed(a).replace(/\.?0+$/,``);return Intl.NumberFormat(void 0,{maximumFractionDigits:t}).format(s)}(t,o,r):t;return(0,F.jsxs)(`div`,{children:[(0,F.jsxs)(z,{$isLoading:s,children:[e&&(0,F.jsx)(V,{src:e,alt:`Token icon`}),a&&a>1?a+`x`:void 0,` `,i,c,` `,n]}),r&&(0,F.jsxs)(B,{$isLoading:s,children:[`$`,r]})]})},z=c.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.375rem;
  word-break: break-all;
  text-align: right;
  display: flex;
  justify-content: flex-end;

  ${w}
`,B=c.span`
  color: var(--privy-color-foreground-2);
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  word-break: break-all;
  text-align: right;
  display: flex;
  justify-content: flex-end;

  ${w}
`,V=c.img`
  height: 14px;
  width: 14px;
  margin-right: 4px;
  object-fit: contain;
`,ae=e=>{let{chain:t,transactionDetails:n,isTokenContractInfoLoading:i,symbol:a}=e,{action:o,functionName:s}=n;return(0,F.jsx)(E,{children:(0,F.jsxs)(b,{children:[o!==`transaction`&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Action`}),(0,F.jsx)(S,{children:s})]}),s===`mint`&&`args`in n&&n.args.filter((e=>e)).map(((e,n)=>(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Param ${n}`}),(0,F.jsx)(S,{children:typeof e==`string`&&r(e)?(0,F.jsx)(D,{address:e,url:t?.blockExplorers?.default?.url,showCopyIcon:!1}):e?.toString()})]},n))),s===`setApprovalForAll`&&n.operator&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Operator`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:n.operator,url:t?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),s===`setApprovalForAll`&&n.approved!==void 0&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Set approval to`}),(0,F.jsx)(S,{children:n.approved?`true`:`false`})]}),s===`transfer`||s===`transferWithMemo`||s===`transferFrom`||s===`safeTransferFrom`||s===`approve`?(0,F.jsxs)(F.Fragment,{children:[`formattedAmount`in n&&n.formattedAmount&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Amount`}),(0,F.jsxs)(S,{$isLoading:i,children:[n.formattedAmount,` `,a]})]}),`tokenId`in n&&n.tokenId&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token ID`}),(0,F.jsx)(S,{children:n.tokenId.toString()})]})]}):null,s===`safeBatchTransferFrom`&&(0,F.jsxs)(F.Fragment,{children:[`amounts`in n&&n.amounts&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Amounts`}),(0,F.jsx)(S,{children:n.amounts.join(`, `)})]}),`tokenIds`in n&&n.tokenIds&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token IDs`}),(0,F.jsx)(S,{children:n.tokenIds.join(`, `)})]})]}),s===`approve`&&n.spender&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Spender`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:n.spender,url:t?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),(s===`transferFrom`||s===`safeTransferFrom`||s===`safeBatchTransferFrom`)&&n.transferFrom&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Transferring from`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:n.transferFrom,url:t?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),(s===`transferFrom`||s===`safeTransferFrom`||s===`safeBatchTransferFrom`)&&n.transferTo&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Transferring to`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:n.transferTo,url:t?.blockExplorers?.default?.url,showCopyIcon:!1})})]})]})})},oe=({variant:e,setPreventMaliciousTransaction:t,colorScheme:n=`light`,preventMaliciousTransaction:r})=>e===`warn`?(0,F.jsx)(H,{children:(0,F.jsxs)(A,{theme:n,children:[(0,F.jsx)(`span`,{style:{fontWeight:`500`},children:`Warning: Suspicious transaction`}),(0,F.jsx)(`br`,{}),`This has been flagged as a potentially deceptive request. Approving could put your assets or funds at risk.`]})}):e===`error`?(0,F.jsx)(F.Fragment,{children:(0,F.jsxs)(H,{children:[(0,F.jsx)(j,{theme:n,children:(0,F.jsxs)(`div`,{children:[(0,F.jsx)(`strong`,{children:`This is a malicious transaction`}),(0,F.jsx)(`br`,{}),`This transaction transfers tokens to a known malicious address. Proceeding may result in the loss of valuable assets.`]})}),(0,F.jsxs)(U,{children:[(0,F.jsx)(_,{color:`var(--privy-color-error)`,checked:!r,readOnly:!0,onClick:()=>t(!r)}),(0,F.jsx)(`span`,{children:`I understand and want to proceed anyways.`})]})]})}):null,H=c.div`
  margin-top: 1.5rem;
`,U=c.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
`,se=({transactionIndex:e,maxIndex:t})=>typeof e!=`number`||t===0?``:` (${e+1} / ${t+1})`,W=({img:e,submitError:t,prepareError:n,onClose:r,action:i,title:a,subtitle:s,to:c,tokenAddress:f,network:g,missingFunds:_,fee:v,from:w,cta:E,disabled:O,chain:k,isSubmitting:A,isPreparing:j,isTokenPriceLoading:N,isTokenContractInfoLoading:P,isSponsored:I,symbol:L,balance:z,onClick:B,transactionDetails:V,transactionIndex:H,maxIndex:U,onBack:W,chainName:G,validation:K,hasScanDetails:q,setIsScanDetailsOpen:pe,preventMaliciousTransaction:me,setPreventMaliciousTransaction:he,tokensSent:J,tokensReceived:Y,isScanning:ge,isCancellable:_e,functionName:ve})=>{let{showTransactionDetails:X,setShowTransactionDetails:Z,hasMoreDetails:Q,isErc20Ish:ye}=(e=>{let[t,n]=(0,M.useState)(!1),r=!0,i=!1;return(!e||e.isErc20Ish||e.action===`transaction`)&&(r=!1),r&&(i=Object.entries(e||{}).some((([e,t])=>t&&![`action`,`isErc20Ish`,`isNFTIsh`].includes(e)))),{showTransactionDetails:t,setShowTransactionDetails:n,hasMoreDetails:r&&i,isErc20Ish:e?.isErc20Ish}})(V),$=o(),be=ye&&P||j||N||ge;return(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(p,{onClose:r,backFn:W}),e&&(0,F.jsx)(ue,{children:e}),(0,F.jsxs)(T,{style:{marginTop:e?`1.5rem`:0},children:[a,(0,F.jsx)(se,{maxIndex:U,transactionIndex:H})]}),(0,F.jsx)(te,{children:s}),(0,F.jsxs)(b,{style:{marginTop:`2rem`},children:[(!!J[0]||be)&&(0,F.jsxs)(x,{children:[Y.length>0?(0,F.jsx)(C,{children:`Send`}):(0,F.jsx)(C,{children:i===`approve`?`Approval amount`:`Amount`}),(0,F.jsx)(`div`,{className:`flex flex-col`,children:J.map(((e,t)=>(0,F.jsx)(R,{iconUrl:e.iconUrl,value:ve===`setApprovalForAll`?`All`:e.value,usdValue:e.usdValue,symbol:e.symbol,nftName:e.nftName,nftCount:e.nftCount,decimals:e.decimals},t)))})]}),Y.length>0&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Receive`}),(0,F.jsx)(`div`,{className:`flex flex-col`,children:Y.map(((e,t)=>(0,F.jsx)(R,{iconUrl:e.iconUrl,value:e.value,usdValue:e.usdValue,symbol:e.symbol,nftName:e.nftName,nftCount:e.nftCount,decimals:e.decimals},t)))})]}),V&&`spender`in V&&V?.spender?(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Spender`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:V.spender,url:k?.blockExplorers?.default?.url})})]}):null,c&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`To`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:c,url:k?.blockExplorers?.default?.url,showCopyIcon:!0})})]}),f&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token address`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:f,url:k?.blockExplorers?.default?.url})})]}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Network`}),(0,F.jsx)(S,{children:g})]}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Estimated fee`}),(0,F.jsx)(S,{$isLoading:j||N||I===void 0,children:I?(0,F.jsxs)(de,{children:[(0,F.jsxs)(fe,{children:[`Sponsored by `,$.name]}),(0,F.jsx)(re,{height:16,width:16})]}):v})]}),Q&&!q&&(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(x,{className:`cursor-pointer`,onClick:()=>Z(!X),children:(0,F.jsxs)(ee,{className:`flex items-center gap-x-1`,children:[`Details`,` `,(0,F.jsx)(h,{style:{width:`0.75rem`,marginLeft:`0.25rem`,transform:X?`rotate(180deg)`:void 0}})]})}),X&&V&&(0,F.jsx)(ae,{action:i,chain:k,transactionDetails:V,isTokenContractInfoLoading:P,symbol:L})]}),q&&(0,F.jsx)(x,{children:(0,F.jsxs)(ie,{onClick:()=>pe(!0),children:[(0,F.jsx)(`span`,{className:`text-color-primary`,children:`Details`}),(0,F.jsx)(ne,{height:`14px`,width:`14px`,strokeWidth:`2`})]})})]}),(0,F.jsx)(l,{}),t?(0,F.jsx)(y,{style:{marginTop:`2rem`},children:t.message}):n&&H===0?(0,F.jsx)(y,{style:{marginTop:`2rem`},children:n.shortMessage??le}):null,(0,F.jsx)(oe,{variant:K,preventMaliciousTransaction:me,setPreventMaliciousTransaction:he}),(0,F.jsx)(ce,{$useSmallMargins:!(!n&&!t&&K!==`warn`&&K!==`error`),address:w,balance:z,errMsg:j||n||t||!_?void 0:`Add funds on ${k?.name??G} to complete transaction.`}),(0,F.jsx)(d,{style:{marginTop:`1rem`},loading:A,disabled:O||j,onClick:B,children:E}),_e&&(0,F.jsx)(u,{style:{marginTop:`1rem`},onClick:r,isSubmitting:!1,children:`Not now`}),(0,F.jsx)(m,{})]})},G=({img:e,title:t,subtitle:n,cta:r,instructions:i,network:a,blockExplorerUrl:c,isMissingFunds:u,submitError:f,parseError:g,total:_,swap:v,transactingWalletAddress:ee,fee:w,balance:E,disabled:k,isSubmitting:A,isPreparing:j,isTokenPriceLoading:N,onClick:ne,onClose:P,onBack:I,isSponsored:L})=>{let R=j||N,[z,B]=(0,M.useState)(!1),V=o();return(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(p,{onClose:P,backFn:I}),e&&(0,F.jsx)(ue,{children:e}),(0,F.jsx)(T,{style:{marginTop:e?`1.5rem`:0},children:t}),(0,F.jsx)(te,{children:n}),(0,F.jsxs)(b,{style:{marginTop:`2rem`,marginBottom:`.5rem`},children:[(_||R)&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Amount`}),(0,F.jsx)(S,{$isLoading:R,children:_})]}),v&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Swap`}),(0,F.jsx)(S,{children:v})]}),a&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Network`}),(0,F.jsx)(S,{children:a})]}),(w||R||L!==void 0)&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Estimated fee`}),(0,F.jsx)(S,{$isLoading:R,children:L&&!R?(0,F.jsxs)(de,{children:[(0,F.jsxs)(fe,{children:[`Sponsored by `,V.name]}),(0,F.jsx)(re,{height:16,width:16})]}):w})]})]}),(0,F.jsx)(x,{children:(0,F.jsxs)(ie,{onClick:()=>B((e=>!e)),children:[(0,F.jsx)(`span`,{children:`Advanced`}),(0,F.jsx)(h,{height:`16px`,width:`16px`,strokeWidth:`2`,style:{transition:`all 300ms`,transform:z?`rotate(180deg)`:void 0}})]})}),z&&(0,F.jsx)(F.Fragment,{children:i.map(((e,t)=>e.type===`sol-transfer`?(0,F.jsxs)(K,{children:[(0,F.jsx)(x,{children:(0,F.jsxs)(O,{children:[`Transfer `,e.withSeed?`with seed`:``]})}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Amount`}),(0,F.jsxs)(S,{children:[s({amount:e.value,decimals:e.token.decimals}),` `,e.token.symbol]})]}),!!e.toAccount&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Destination`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.toAccount,url:c})})]})]},t):e.type===`spl-transfer`?(0,F.jsxs)(K,{children:[(0,F.jsx)(x,{children:(0,F.jsxs)(O,{children:[`Transfer `,e.token.symbol]})}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Amount`}),(0,F.jsx)(S,{children:e.value.toString()})]}),!!e.fromAta&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Source`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.fromAta,url:c})})]}),!!e.toAta&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Destination`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.toAta,url:c})})]}),!!e.token.address&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.token.address,url:c})})]})]},t):e.type===`ata-creation`?(0,F.jsxs)(K,{children:[(0,F.jsx)(x,{children:(0,F.jsx)(O,{children:`Create token account`})}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Program ID`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.program,url:c})})]}),!!e.owner&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Owner`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.owner,url:c})})]})]},t):e.type===`create-account`?(0,F.jsxs)(K,{children:[(0,F.jsx)(x,{children:(0,F.jsxs)(O,{children:[`Create account `,e.withSeed?`with seed`:``]})}),!!e.account&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Account`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.account,url:c})})]}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Amount`}),(0,F.jsxs)(S,{children:[s({amount:e.value,decimals:9}),` SOL`]})]})]},t):e.type===`spl-init-account`?(0,F.jsxs)(K,{children:[(0,F.jsx)(x,{children:(0,F.jsx)(O,{children:`Initialize token account`})}),!!e.account&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Account`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.account,url:c})})]}),!!e.mint&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Mint`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.mint,url:c})})]}),!!e.owner&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Owner`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.owner,url:c})})]})]},t):e.type===`spl-close-account`?(0,F.jsxs)(K,{children:[(0,F.jsx)(x,{children:(0,F.jsx)(O,{children:`Close token account`})}),!!e.source&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Source`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.source,url:c})})]}),!!e.destination&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Destination`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.destination,url:c})})]}),!!e.owner&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Owner`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.owner,url:c})})]})]},t):e.type===`spl-sync-native`?(0,F.jsxs)(K,{children:[(0,F.jsx)(x,{children:(0,F.jsx)(O,{children:`Sync native`})}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Program ID`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.program,url:c})})]})]},t):e.type===`raydium-swap-base-input`?(0,F.jsxs)(K,{children:[(0,F.jsx)(x,{children:(0,F.jsxs)(O,{children:[`Raydium swap`,` `,e.tokenIn&&e.tokenOut?`${e.tokenIn.symbol} → ${e.tokenOut.symbol}`:``]})}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Amount in`}),(0,F.jsx)(S,{children:e.amountIn.toString()})]}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Minimum amount out`}),(0,F.jsx)(S,{children:e.minimumAmountOut.toString()})]}),e.mintIn&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token in`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.mintIn,url:c})})]}),e.mintOut&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token out`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.mintOut,url:c})})]})]},t):e.type===`raydium-swap-base-output`?(0,F.jsxs)(K,{children:[(0,F.jsx)(x,{children:(0,F.jsxs)(O,{children:[`Raydium swap`,` `,e.tokenIn&&e.tokenOut?`${e.tokenIn.symbol} → ${e.tokenOut.symbol}`:``]})}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Max amount in`}),(0,F.jsx)(S,{children:e.maxAmountIn.toString()})]}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Amount out`}),(0,F.jsx)(S,{children:e.amountOut.toString()})]}),e.mintIn&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token in`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.mintIn,url:c})})]}),e.mintOut&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token out`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.mintOut,url:c})})]})]},t):e.type===`jupiter-swap-shared-accounts-route`?(0,F.jsxs)(K,{children:[(0,F.jsx)(x,{children:(0,F.jsxs)(O,{children:[`Jupiter swap`,` `,e.tokenIn&&e.tokenOut?`${e.tokenIn.symbol} → ${e.tokenOut.symbol}`:``]})}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`In amount`}),(0,F.jsx)(S,{children:e.inAmount.toString()})]}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Quoted out amount`}),(0,F.jsx)(S,{children:e.quotedOutAmount.toString()})]}),e.mintIn&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token in`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.mintIn,url:c})})]}),e.mintOut&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token out`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.mintOut,url:c})})]})]},t):e.type===`jupiter-swap-exact-out-route`?(0,F.jsxs)(K,{children:[(0,F.jsx)(x,{children:(0,F.jsxs)(O,{children:[`Jupiter swap`,` `,e.tokenIn&&e.tokenOut?`${e.tokenIn.symbol} → ${e.tokenOut.symbol}`:``]})}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Quoted in amount`}),(0,F.jsx)(S,{children:e.quotedInAmount.toString()})]}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Amount out`}),(0,F.jsx)(S,{children:e.outAmount.toString()})]}),e.mintIn&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token in`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.mintIn,url:c})})]}),e.mintOut&&(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Token out`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.mintOut,url:c})})]})]},t):(0,F.jsxs)(K,{children:[(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Program ID`}),(0,F.jsx)(S,{children:(0,F.jsx)(D,{address:e.program,url:c})})]}),(0,F.jsxs)(x,{children:[(0,F.jsx)(C,{children:`Data`}),(0,F.jsx)(S,{children:e.discriminator})]})]},t)))}),(0,F.jsx)(l,{}),f?(0,F.jsx)(y,{style:{marginTop:`2rem`},children:f.message}):g?(0,F.jsx)(y,{style:{marginTop:`2rem`},children:le}):null,(0,F.jsx)(ce,{$useSmallMargins:!(!g&&!f),title:``,address:ee,balance:E,errMsg:j||g||f||!u?void 0:`Add funds on Solana to complete transaction.`}),(0,F.jsx)(d,{style:{marginTop:`1rem`},loading:A,disabled:k||j,onClick:ne,children:r}),(0,F.jsx)(m,{})]})},ce=c(k)`
  ${e=>e.$useSmallMargins?`margin-top: 0.5rem;`:`margin-top: 2rem;`}
`,K=c(b)`
  margin-top: 0.5rem;
  border: 1px solid var(--privy-color-foreground-4);
  border-radius: var(--privy-border-radius-sm);
  padding: 0.5rem;
`,le=`There was an error preparing your transaction. Your transaction request will likely fail.`,ue=c.div`
  display: flex;
  width: 100%;
  justify-content: center;
  max-height: 40px;

  > img {
    object-fit: contain;
    border-radius: var(--privy-border-radius-sm);
  }
`,de=c.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
`,fe=c.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,q=e=>e?.code===a.COMPLIANCE_BLOCKED,pe=()=>(0,F.jsxs)(ge,{children:[(0,F.jsx)(ve,{}),(0,F.jsx)(_e,{})]}),me=({transactionError:e,chainId:t,onClose:n,onRetry:r,chainType:a,transactionHash:o})=>{let{chains:s}=i(),[c,l]=(0,M.useState)(!1),{errorCode:u,errorMessage:d}=((e,t)=>{if(t===`ethereum`)return q(e)?{errorCode:`Transaction blocked`,errorMessage:e.message}:{errorCode:e.details??e.message,errorMessage:e.shortMessage};let n=e.txSignature,r=e?.transactionMessage||`Something went wrong.`;if(Array.isArray(e.logs)){let t=e.logs.find((e=>/insufficient (lamports|funds)/gi.test(e)));t&&(r=t)}return{transactionHash:n,errorMessage:r}})(e,a),m=q(e),h=(({chains:e,chainId:t,chainType:n,transactionHash:r})=>n===`ethereum`?e.find((e=>e.id===t))?.blockExplorers?.default.url??`https://etherscan.io`:function(e,t){return`https://explorer.solana.com/tx/${e}?chain=${t}`}(r||``,t))({chains:s,chainId:t,chainType:a,transactionHash:o});return(0,F.jsxs)(F.Fragment,{children:[(0,F.jsx)(p,{onClose:n}),(0,F.jsxs)(he,{children:[(0,F.jsx)(pe,{}),(0,F.jsx)(J,{children:u}),(0,F.jsx)(Y,{children:m?`This transaction cannot be completed.`:`Please try again.`}),(0,F.jsxs)(Q,{children:[(0,F.jsx)(Z,{children:`Error message`}),(0,F.jsx)($,{$clickable:!1,children:d})]}),o&&(0,F.jsxs)(Q,{children:[(0,F.jsx)(Z,{children:`Transaction hash`}),(0,F.jsxs)(ye,{children:[`Copy this hash to view details about the transaction on a`,` `,(0,F.jsx)(`u`,{children:(0,F.jsx)(`a`,{href:h,children:`block explorer`})}),`.`]}),(0,F.jsxs)($,{$clickable:!0,onClick:async()=>{await navigator.clipboard.writeText(o),l(!0)},children:[o,(0,F.jsx)(Se,{clicked:c})]})]}),!m&&(0,F.jsx)(X,{onClick:()=>r({resetNonce:!!o}),children:`Retry transaction`})]}),(0,F.jsx)(f,{})]})},he=c.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`,J=c.span`
  color: var(--privy-color-foreground);
  text-align: center;
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.25rem; /* 111.111% */
  text-align: center;
  margin: 10px;
`,Y=c.span`
  margin-top: 4px;
  margin-bottom: 10px;
  color: var(--privy-color-foreground-3);
  text-align: center;

  font-size: 0.875rem;
  font-style: normal;
  font-weight: 400;
  line-height: 20px; /* 142.857% */
  letter-spacing: -0.008px;
`,ge=c.div`
  position: relative;
  width: 60px;
  height: 60px;
  margin: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
`,_e=c(v)`
  position: absolute;
  width: 35px;
  height: 35px;
  color: var(--privy-color-error);
`,ve=c.div`
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background-color: var(--privy-color-error);
  opacity: 0.1;
`,X=c(d)`
  && {
    margin-top: 24px;
  }
  transition:
    color 350ms ease,
    background-color 350ms ease;
`,Z=c.span`
  width: 100%;
  text-align: left;
  font-size: 0.825rem;
  color: var(--privy-color-foreground);
  padding: 4px;
`,Q=c.div`
  width: 100%;
  margin: 5px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`,ye=c.text`
  position: relative;
  width: 100%;
  padding: 5px;
  font-size: 0.8rem;
  color: var(--privy-color-foreground-3);
  text-align: left;
  word-wrap: break-word;
`,$=c.span`
  position: relative;
  width: 100%;
  background-color: var(--privy-color-background-2);
  padding: 8px 12px;
  border-radius: 10px;
  margin-top: 5px;
  font-size: 14px;
  color: var(--privy-color-foreground-3);
  text-align: left;
  word-wrap: break-word;
  ${e=>e.$clickable&&`cursor: pointer;
  transition: background-color 0.3s;
  padding-right: 45px;

  &:hover {
    background-color: var(--privy-color-foreground-4);
  }`}
`,be=c(L)`
  position: absolute;
  top: 13px;
  right: 13px;
  width: 24px;
  height: 24px;
`,xe=c(g)`
  position: absolute;
  top: 13px;
  right: 13px;
  width: 24px;
  height: 24px;
`,Se=({clicked:e})=>(0,F.jsx)(e?xe:be,{});export{G as n,me as r,W as t};