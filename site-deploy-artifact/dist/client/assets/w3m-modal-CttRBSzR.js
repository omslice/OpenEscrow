import{B as e,C as t,E as n,M as r,O as i,P as a,U as o,V as s,_ as c,a as l,b as u,d,f as ee,g as f,i as p,j as m,l as te,m as h,n as g,o as ne,p as _,t as re,u as ie,v as ae,w as v,x as oe,y}from"./ApiController-3rK5lmIi.js";import{c as se,i as b,l as x,n as ce,p as S,r as le,s as C,t as w,v as ue}from"./ConstantsUtil-CTbfeIeU.js";import{a as T,c as E,i as D,o as de,s as O}from"./wui-ux-by-reown-CExRvDrX.js";import{n as fe,t as pe}from"./SIWXUtil-naPgh-9t.js";var k={getGasPriceInEther(e,t){let n=t*e;return Number(n)/0xde0b6b3a7640000},getGasPriceInUSD(e,t,n){let r=k.getGasPriceInEther(t,n);return s.bigNumber(e).times(r).toNumber()},getPriceImpact({sourceTokenAmount:e,sourceTokenPriceInUSD:t,toTokenPriceInUSD:n,toTokenAmount:r}){let i=s.bigNumber(e).times(t),a=s.bigNumber(r).times(n);return i.minus(a).div(i).times(100).toNumber()},getMaxSlippage(e,t){let n=s.bigNumber(e).div(100);return s.multiply(t,n).toNumber()},getProviderFee(e,t=.0085){return s.bigNumber(e).times(t).toString()},isInsufficientNetworkTokenForGas(e,t){let n=t||`0`;return s.bigNumber(e).eq(0)?!0:s.bigNumber(s.bigNumber(n)).gt(e)},isInsufficientSourceTokenForSwap(e,t,n){let r=n?.find(e=>e.address===t)?.quantity?.numeric;return s.bigNumber(r||`0`).lt(e)}},me=15e4,A={initializing:!1,initialized:!1,loadingPrices:!1,loadingQuote:!1,loadingApprovalTransaction:!1,loadingBuildTransaction:!1,loadingTransaction:!1,switchingTokens:!1,fetchError:!1,approvalTransaction:void 0,swapTransaction:void 0,transactionError:void 0,sourceToken:void 0,sourceTokenAmount:``,sourceTokenPriceInUSD:0,toToken:void 0,toTokenAmount:``,toTokenPriceInUSD:0,networkPrice:`0`,networkBalanceInUSD:`0`,networkTokenSymbol:``,inputError:void 0,slippage:i.CONVERT_SLIPPAGE_TOLERANCE,tokens:void 0,popularTokens:void 0,suggestedTokens:void 0,foundTokens:void 0,myTokensWithBalance:void 0,tokensPriceMap:{},gasFee:`0`,gasPriceInUSD:0,priceImpact:void 0,maxSlippage:void 0,providerFee:void 0},j=r({...A}),he={state:j,subscribe(e){return a(j,()=>e(j))},subscribeKey(e,t){return m(j,e,t)},getParams(){let e=g.state.activeChain,t=g.getAccountData(e)?.caipAddress??g.state.activeCaipAddress,r=n.getPlainAddress(t),i=te(),a=d.getConnectorId(g.state.activeChain);if(!r)throw Error(`No address found to swap the tokens from.`);let c=!j.toToken?.address||!j.toToken?.decimals,l=!j.sourceToken?.address||!j.sourceToken?.decimals||!s.bigNumber(j.sourceTokenAmount).gt(0),u=!j.sourceTokenAmount;return{networkAddress:i,fromAddress:r,fromCaipAddress:t,sourceTokenAddress:j.sourceToken?.address,toTokenAddress:j.toToken?.address,toTokenAmount:j.toTokenAmount,toTokenDecimals:j.toToken?.decimals,sourceTokenAmount:j.sourceTokenAmount,sourceTokenDecimals:j.sourceToken?.decimals,invalidToToken:c,invalidSourceToken:l,invalidSourceTokenAmount:u,availableToSwap:t&&!c&&!l&&!u,isAuthConnector:a===o.CONNECTOR_ID.AUTH}},async setSourceToken(e){if(!e){j.sourceToken=e,j.sourceTokenAmount=``,j.sourceTokenPriceInUSD=0;return}j.sourceToken=e,await M.setTokenPrice(e.address,`sourceToken`)},setSourceTokenAmount(e){j.sourceTokenAmount=e},async setToToken(e){if(!e){j.toToken=e,j.toTokenAmount=``,j.toTokenPriceInUSD=0;return}j.toToken=e,await M.setTokenPrice(e.address,`toToken`)},setToTokenAmount(e){j.toTokenAmount=e?s.toFixed(e,6):``},async setTokenPrice(e,t){let n=j.tokensPriceMap[e]||0;n||=(j.loadingPrices=!0,await M.getAddressPrice(e)),t===`sourceToken`?j.sourceTokenPriceInUSD=n:t===`toToken`&&(j.toTokenPriceInUSD=n),j.loadingPrices&&=!1,M.getParams().availableToSwap&&!j.switchingTokens&&M.swapTokens()},async switchTokens(){if(!(j.initializing||!j.initialized||j.switchingTokens)){j.switchingTokens=!0;try{let e=j.toToken?{...j.toToken}:void 0,t=j.sourceToken?{...j.sourceToken}:void 0,n=e&&j.toTokenAmount===``?`1`:j.toTokenAmount;M.setSourceTokenAmount(n),M.setToTokenAmount(``),await M.setSourceToken(e),await M.setToToken(t),j.switchingTokens=!1,M.swapTokens()}catch(e){throw j.switchingTokens=!1,e}}},resetState(){j.myTokensWithBalance=A.myTokensWithBalance,j.tokensPriceMap=A.tokensPriceMap,j.initialized=A.initialized,j.initializing=A.initializing,j.switchingTokens=A.switchingTokens,j.sourceToken=A.sourceToken,j.sourceTokenAmount=A.sourceTokenAmount,j.sourceTokenPriceInUSD=A.sourceTokenPriceInUSD,j.toToken=A.toToken,j.toTokenAmount=A.toTokenAmount,j.toTokenPriceInUSD=A.toTokenPriceInUSD,j.networkPrice=A.networkPrice,j.networkTokenSymbol=A.networkTokenSymbol,j.networkBalanceInUSD=A.networkBalanceInUSD,j.inputError=A.inputError},resetValues(){let{networkAddress:e}=M.getParams(),t=j.tokens?.find(t=>t.address===e);M.setSourceToken(t),M.setToToken(void 0)},getApprovalLoadingState(){return j.loadingApprovalTransaction},clearError(){j.transactionError=void 0},async initializeState(){if(!j.initializing){if(j.initializing=!0,!j.initialized)try{await M.fetchTokens(),j.initialized=!0}catch{j.initialized=!1,y.showError(`Failed to initialize swap`),_.goBack()}j.initializing=!1}},async fetchTokens(){let{networkAddress:e}=M.getParams();await M.getNetworkTokenPrice(),await M.getMyTokensWithBalance();let t=j.myTokensWithBalance?.find(t=>t.address===e);t&&(j.networkTokenSymbol=t.symbol,M.setSourceToken(t),M.setSourceTokenAmount(`0`))},async getTokenList(){let e=g.state.activeCaipNetwork?.caipNetworkId;if(!(j.caipNetworkId===e&&j.tokens))try{j.tokensLoading=!0;let t=await p.getTokenList(e);j.tokens=t,j.caipNetworkId=e,j.popularTokens=t.sort((e,t)=>e.symbol<t.symbol?-1:+(e.symbol>t.symbol)),j.suggestedTokens=t.filter(e=>!!i.SWAP_SUGGESTED_TOKENS.includes(e.symbol))}catch{j.tokens=[],j.popularTokens=[],j.suggestedTokens=[]}finally{j.tokensLoading=!1}},async getAddressPrice(e){let t=j.tokensPriceMap[e];if(t)return t;let n=(await ae.fetchTokenPrice({addresses:[e]}))?.fungibles||[],r=[...j.tokens||[],...j.myTokensWithBalance||[]].find(t=>t.address===e)?.symbol,i=n.find(e=>e.symbol.toLowerCase()===r?.toLowerCase())?.price||0,a=parseFloat(i.toString());return j.tokensPriceMap[e]=a,a},async getNetworkTokenPrice(){let{networkAddress:e}=M.getParams(),t=(await ae.fetchTokenPrice({addresses:[e]}).catch(()=>(y.showError(`Failed to fetch network token price`),{fungibles:[]}))).fungibles?.[0],n=t?.price.toString()||`0`;j.tokensPriceMap[e]=parseFloat(n),j.networkTokenSymbol=t?.symbol||``,j.networkPrice=n},async getMyTokensWithBalance(e){let t=await l.getMyTokensWithBalance(e),n=p.mapBalancesToSwapTokens(t);n&&(await M.getInitialGasPrice(),M.setBalances(n))},setBalances(e){let{networkAddress:t}=M.getParams(),n=g.state.activeCaipNetwork;if(!n)return;let r=e.find(e=>e.address===t);e.forEach(e=>{j.tokensPriceMap[e.address]=e.price||0}),j.myTokensWithBalance=e.filter(e=>e.address.startsWith(n.caipNetworkId)),j.networkBalanceInUSD=r?s.multiply(r.quantity.numeric,r.price).toString():`0`},async getInitialGasPrice(){let e=await p.fetchGasPrice();if(!e)return{gasPrice:null,gasPriceInUSD:null};switch(g.state?.activeCaipNetwork?.chainNamespace){case o.CHAIN.SOLANA:return j.gasFee=e.standard??`0`,j.gasPriceInUSD=s.multiply(e.standard,j.networkPrice).div(1e9).toNumber(),{gasPrice:BigInt(j.gasFee),gasPriceInUSD:Number(j.gasPriceInUSD)};case o.CHAIN.EVM:default:let t=e.standard??`0`,n=BigInt(t),r=BigInt(me),i=k.getGasPriceInUSD(j.networkPrice,r,n);return j.gasFee=t,j.gasPriceInUSD=i,{gasPrice:n,gasPriceInUSD:i}}},async swapTokens(){let e=g.getAccountData()?.address,t=j.sourceToken,n=j.toToken,r=s.bigNumber(j.sourceTokenAmount).gt(0);if(r||M.setToTokenAmount(``),!n||!t||j.loadingPrices||!r||!e)return;j.loadingQuote=!0;let i=s.bigNumber(j.sourceTokenAmount).times(10**t.decimals).round(0);try{let r=await ae.fetchSwapQuote({userAddress:e,from:t.address,to:n.address,gasPrice:j.gasFee,amount:i.toString()});j.loadingQuote=!1;let a=r?.quotes?.[0]?.toAmount;if(!a){fe.open({displayMessage:`Incorrect amount`,debugMessage:`Please enter a valid amount`},`error`);return}let o=s.bigNumber(a).div(10**n.decimals).toString();M.setToTokenAmount(o),M.hasInsufficientToken(j.sourceTokenAmount,t.address)?j.inputError=`Insufficient balance`:(j.inputError=void 0,M.setTransactionDetails())}catch(e){let t=await p.handleSwapError(e);j.loadingQuote=!1,j.inputError=t||`Insufficient balance`}},async getTransaction(){let{fromCaipAddress:e,availableToSwap:t}=M.getParams(),n=j.sourceToken,r=j.toToken;if(!(!e||!t||!n||!r||j.loadingQuote))try{j.loadingBuildTransaction=!0;let t=await p.fetchSwapAllowance({userAddress:e,tokenAddress:n.address,sourceTokenAmount:j.sourceTokenAmount,sourceTokenDecimals:n.decimals}),r;return r=t?await M.createSwapTransaction():await M.createAllowanceTransaction(),j.loadingBuildTransaction=!1,j.fetchError=!1,r}catch{_.goBack(),y.showError(`Failed to check allowance`),j.loadingBuildTransaction=!1,j.approvalTransaction=void 0,j.swapTransaction=void 0,j.fetchError=!0;return}},async createAllowanceTransaction(){let{fromCaipAddress:e,sourceTokenAddress:t,toTokenAddress:r}=M.getParams();if(!(!e||!r)){if(!t)throw Error(`createAllowanceTransaction - No source token address found.`);try{let i=await ae.generateApproveCalldata({from:t,to:r,userAddress:e}),a=n.getPlainAddress(i.tx.from);if(!a)throw Error(`SwapController:createAllowanceTransaction - address is required`);let o={data:i.tx.data,to:a,gasPrice:BigInt(i.tx.eip155.gasPrice),value:BigInt(i.tx.value),toAmount:j.toTokenAmount};return j.swapTransaction=void 0,j.approvalTransaction={data:o.data,to:o.to,gasPrice:o.gasPrice,value:o.value,toAmount:o.toAmount},{data:o.data,to:o.to,gasPrice:o.gasPrice,value:o.value,toAmount:o.toAmount}}catch{_.goBack(),y.showError(`Failed to create approval transaction`),j.approvalTransaction=void 0,j.swapTransaction=void 0,j.fetchError=!0;return}}},async createSwapTransaction(){let{networkAddress:e,fromCaipAddress:t,sourceTokenAmount:r}=M.getParams(),i=j.sourceToken,a=j.toToken;if(!t||!r||!i||!a)return;let o=ne.parseUnits(r,i.decimals)?.toString();try{let r=await ae.generateSwapCalldata({userAddress:t,from:i.address,to:a.address,amount:o,disableEstimate:!0}),s=i.address===e,c=BigInt(r.tx.eip155.gas),l=BigInt(r.tx.eip155.gasPrice),u=n.getPlainAddress(r.tx.to);if(!u)throw Error(`SwapController:createSwapTransaction - address is required`);let d={data:r.tx.data,to:u,gas:c,gasPrice:l,value:BigInt(s?o??`0`:`0`),toAmount:j.toTokenAmount};return j.gasPriceInUSD=k.getGasPriceInUSD(j.networkPrice,c,l),j.approvalTransaction=void 0,j.swapTransaction=d,d}catch{_.goBack(),y.showError(`Failed to create transaction`),j.approvalTransaction=void 0,j.swapTransaction=void 0,j.fetchError=!0;return}},onEmbeddedWalletApprovalSuccess(){y.showLoading(`Approve limit increase in your wallet`),_.replace(`SwapPreview`)},async sendTransactionForApproval(e){let{fromAddress:t,isAuthConnector:n}=M.getParams();j.loadingApprovalTransaction=!0,n?_.pushTransactionStack({onSuccess:M.onEmbeddedWalletApprovalSuccess}):y.showLoading(`Approve limit increase in your wallet`);try{await ne.sendTransaction({address:t,to:e.to,data:e.data,value:e.value,chainNamespace:o.CHAIN.EVM}),await M.swapTokens(),await M.getTransaction(),j.approvalTransaction=void 0,j.loadingApprovalTransaction=!1}catch(e){let t=e;j.transactionError=t?.displayMessage,j.loadingApprovalTransaction=!1,y.showError(t?.displayMessage||`Transaction error`),f.sendEvent({type:`track`,event:`SWAP_APPROVAL_ERROR`,properties:{message:t?.displayMessage||t?.message||`Unknown`,network:g.state.activeCaipNetwork?.caipNetworkId||``,swapFromToken:M.state.sourceToken?.symbol||``,swapToToken:M.state.toToken?.symbol||``,swapFromAmount:M.state.sourceTokenAmount||``,swapToAmount:M.state.toTokenAmount||``,isSmartAccount:ie(o.CHAIN.EVM)===c.ACCOUNT_TYPES.SMART_ACCOUNT}})}},async sendTransactionForSwap(e){if(!e)return;let{fromAddress:t,toTokenAmount:n,isAuthConnector:r}=M.getParams();j.loadingTransaction=!0;let i=`Swapping ${j.sourceToken?.symbol} to ${s.formatNumberToLocalString(n,3)} ${j.toToken?.symbol}`,a=`Swapped ${j.sourceToken?.symbol} to ${s.formatNumberToLocalString(n,3)} ${j.toToken?.symbol}`;r?_.pushTransactionStack({onSuccess(){_.replace(`Account`),y.showLoading(i),he.resetState()}}):y.showLoading(`Confirm transaction in your wallet`);try{let n=[j.sourceToken?.address,j.toToken?.address].join(`,`),i=await ne.sendTransaction({address:t,to:e.to,data:e.data,value:e.value,chainNamespace:o.CHAIN.EVM});return j.loadingTransaction=!1,y.showSuccess(a),f.sendEvent({type:`track`,event:`SWAP_SUCCESS`,properties:{network:g.state.activeCaipNetwork?.caipNetworkId||``,swapFromToken:M.state.sourceToken?.symbol||``,swapToToken:M.state.toToken?.symbol||``,swapFromAmount:M.state.sourceTokenAmount||``,swapToAmount:M.state.toTokenAmount||``,isSmartAccount:ie(o.CHAIN.EVM)===c.ACCOUNT_TYPES.SMART_ACCOUNT}}),he.resetState(),r||_.replace(`Account`),he.getMyTokensWithBalance(n),i}catch(e){let t=e;j.transactionError=t?.displayMessage,j.loadingTransaction=!1,y.showError(t?.displayMessage||`Transaction error`),f.sendEvent({type:`track`,event:`SWAP_ERROR`,properties:{message:t?.displayMessage||t?.message||`Unknown`,network:g.state.activeCaipNetwork?.caipNetworkId||``,swapFromToken:M.state.sourceToken?.symbol||``,swapToToken:M.state.toToken?.symbol||``,swapFromAmount:M.state.sourceTokenAmount||``,swapToAmount:M.state.toTokenAmount||``,isSmartAccount:ie(o.CHAIN.EVM)===c.ACCOUNT_TYPES.SMART_ACCOUNT}});return}},hasInsufficientToken(e,t){return k.isInsufficientSourceTokenForSwap(e,t,j.myTokensWithBalance)},setTransactionDetails(){let{toTokenAddress:e,toTokenDecimals:t}=M.getParams();!e||!t||(j.gasPriceInUSD=k.getGasPriceInUSD(j.networkPrice,BigInt(j.gasFee),BigInt(me)),j.priceImpact=k.getPriceImpact({sourceTokenAmount:j.sourceTokenAmount,sourceTokenPriceInUSD:j.sourceTokenPriceInUSD,toTokenPriceInUSD:j.toTokenPriceInUSD,toTokenAmount:j.toTokenAmount}),j.maxSlippage=k.getMaxSlippage(j.slippage,j.toTokenAmount),j.providerFee=k.getProviderFee(j.sourceTokenAmount))}},M=t(he),N=r({message:``,open:!1,triggerRect:{width:0,height:0,top:0,left:0},variant:`shade`}),P=t({state:N,subscribe(e){return a(N,()=>e(N))},subscribeKey(e,t){return m(N,e,t)},showTooltip({message:e,triggerRect:t,variant:n}){N.open=!0,N.message=e,N.triggerRect=t,N.variant=n},hide(){N.open=!1,N.message=``,N.triggerRect={width:0,height:0,top:0,left:0}}}),ge={isUnsupportedChainView(){return _.state.view===`UnsupportedChain`||_.state.view===`SwitchNetwork`&&_.state.history.includes(`UnsupportedChain`)},async safeClose(){if(this.isUnsupportedChainView()){h.shake();return}if(await pe.isSIWXCloseDisabled()){h.shake();return}(_.state.view===`DataCapture`||_.state.view===`DataCaptureOtpConfirm`)&&ne.disconnect(),h.close()}},_e=C`
  :host {
    display: block;
    border-radius: clamp(0px, ${({borderRadius:e})=>e[8]}, 44px);
    box-shadow: 0 0 0 1px ${({tokens:e})=>e.theme.foregroundPrimary};
    overflow: hidden;
  }
`,ve=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},ye=class extends x{render(){return S`<slot></slot>`}};ye.styles=[b,_e],ye=ve([T(`wui-card`)],ye);var be=C`
  :host {
    width: 100%;
  }

  :host > wui-flex {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${({spacing:e})=>e[2]};
    padding: ${({spacing:e})=>e[3]};
    border-radius: ${({borderRadius:e})=>e[6]};
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
    box-sizing: border-box;
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    box-shadow: 0px 0px 16px 0px rgba(0, 0, 0, 0.25);
    color: ${({tokens:e})=>e.theme.textPrimary};
  }

  :host > wui-flex[data-type='info'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};

      wui-icon {
        color: ${({tokens:e})=>e.theme.iconDefault};
      }
    }
  }
  :host > wui-flex[data-type='success'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundSuccess};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderSuccess};
      }
    }
  }
  :host > wui-flex[data-type='warning'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundWarning};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderWarning};
      }
    }
  }
  :host > wui-flex[data-type='error'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundError};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderError};
      }
    }
  }

  wui-flex {
    width: 100%;
  }

  wui-text {
    word-break: break-word;
    flex: 1;
  }

  .close {
    cursor: pointer;
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  .icon-box {
    height: 40px;
    width: 40px;
    border-radius: ${({borderRadius:e})=>e[2]};
    background-color: var(--local-icon-bg-value);
  }
`,xe=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},Se={info:`info`,success:`checkmark`,warning:`warningCircle`,error:`warning`},F=class extends x{constructor(){super(...arguments),this.message=``,this.type=`info`}render(){return S`
      <wui-flex
        data-type=${D(this.type)}
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        gap="2"
      >
        <wui-flex columnGap="2" flexDirection="row" alignItems="center">
          <wui-flex
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            class="icon-box"
          >
            <wui-icon color="inherit" size="md" name=${Se[this.type]}></wui-icon>
          </wui-flex>
          <wui-text variant="md-medium" color="inherit" data-testid="wui-alertbar-text"
            >${this.message}</wui-text
          >
        </wui-flex>
        <wui-icon
          class="close"
          color="inherit"
          size="sm"
          name="close"
          @click=${this.onClose}
        ></wui-icon>
      </wui-flex>
    `}onClose(){fe.close()}};F.styles=[b,be],xe([E()],F.prototype,`message`,void 0),xe([E()],F.prototype,`type`,void 0),F=xe([T(`wui-alertbar`)],F);var Ce=C`
  :host {
    display: block;
    position: absolute;
    top: ${({spacing:e})=>e[3]};
    left: ${({spacing:e})=>e[4]};
    right: ${({spacing:e})=>e[4]};
    opacity: 0;
    pointer-events: none;
  }
`,we=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},Te={info:{backgroundColor:`fg-350`,iconColor:`fg-325`,icon:`info`},success:{backgroundColor:`success-glass-reown-020`,iconColor:`success-125`,icon:`checkmark`},warning:{backgroundColor:`warning-glass-reown-020`,iconColor:`warning-100`,icon:`warningCircle`},error:{backgroundColor:`error-glass-reown-020`,iconColor:`error-125`,icon:`warning`}},Ee=class extends x{constructor(){super(),this.unsubscribe=[],this.open=fe.state.open,this.onOpen(!0),this.unsubscribe.push(fe.subscribeKey(`open`,e=>{this.open=e,this.onOpen(!1)}))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){let{message:e,variant:t}=fe.state,n=Te[t];return S`
      <wui-alertbar
        message=${e}
        backgroundColor=${n?.backgroundColor}
        iconColor=${n?.iconColor}
        icon=${n?.icon}
        type=${t}
      ></wui-alertbar>
    `}onOpen(e){this.open?(this.animate([{opacity:0,transform:`scale(0.85)`},{opacity:1,transform:`scale(1)`}],{duration:150,fill:`forwards`,easing:`ease`}),this.style.cssText=`pointer-events: auto`):e||(this.animate([{opacity:1,transform:`scale(1)`},{opacity:0,transform:`scale(0.85)`}],{duration:150,fill:`forwards`,easing:`ease`}),this.style.cssText=`pointer-events: none`)}};Ee.styles=Ce,we([O()],Ee.prototype,`open`,void 0),Ee=we([T(`w3m-alertbar`)],Ee);var De=C`
  :host {
    position: relative;
  }

  button {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: transparent;
    padding: ${({spacing:e})=>e[1]};
  }

  /* -- Colors --------------------------------------------------- */
  button[data-type='accent'] wui-icon {
    color: ${({tokens:e})=>e.core.iconAccentPrimary};
  }

  button[data-type='neutral'][data-variant='primary'] wui-icon {
    color: ${({tokens:e})=>e.theme.iconInverse};
  }

  button[data-type='neutral'][data-variant='secondary'] wui-icon {
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  button[data-type='success'] wui-icon {
    color: ${({tokens:e})=>e.core.iconSuccess};
  }

  button[data-type='error'] wui-icon {
    color: ${({tokens:e})=>e.core.iconError};
  }

  /* -- Sizes --------------------------------------------------- */
  button[data-size='xs'] {
    width: 16px;
    height: 16px;

    border-radius: ${({borderRadius:e})=>e[1]};
  }

  button[data-size='sm'] {
    width: 20px;
    height: 20px;
    border-radius: ${({borderRadius:e})=>e[1]};
  }

  button[data-size='md'] {
    width: 24px;
    height: 24px;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  button[data-size='lg'] {
    width: 28px;
    height: 28px;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  button[data-size='xs'] wui-icon {
    width: 8px;
    height: 8px;
  }

  button[data-size='sm'] wui-icon {
    width: 12px;
    height: 12px;
  }

  button[data-size='md'] wui-icon {
    width: 16px;
    height: 16px;
  }

  button[data-size='lg'] wui-icon {
    width: 20px;
    height: 20px;
  }

  /* -- Hover --------------------------------------------------- */
  @media (hover: hover) {
    button[data-type='accent']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.foregroundAccent010};
    }

    button[data-variant='primary'][data-type='neutral']:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }

    button[data-variant='secondary'][data-type='neutral']:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }

    button[data-type='success']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.backgroundSuccess};
    }

    button[data-type='error']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.backgroundError};
    }
  }

  /* -- Focus --------------------------------------------------- */
  button:focus-visible {
    box-shadow: 0 0 0 4px ${({tokens:e})=>e.core.foregroundAccent020};
  }

  /* -- Properties --------------------------------------------------- */
  button[data-full-width='true'] {
    width: 100%;
  }

  :host([fullWidth]) {
    width: 100%;
  }

  button[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
`,I=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},L=class extends x{constructor(){super(...arguments),this.icon=`card`,this.variant=`primary`,this.type=`accent`,this.size=`md`,this.iconSize=void 0,this.fullWidth=!1,this.disabled=!1}render(){return S`<button
      data-variant=${this.variant}
      data-type=${this.type}
      data-size=${this.size}
      data-full-width=${this.fullWidth}
      ?disabled=${this.disabled}
    >
      <wui-icon color="inherit" name=${this.icon} size=${D(this.iconSize)}></wui-icon>
    </button>`}};L.styles=[b,ce,De],I([E()],L.prototype,`icon`,void 0),I([E()],L.prototype,`variant`,void 0),I([E()],L.prototype,`type`,void 0),I([E()],L.prototype,`size`,void 0),I([E()],L.prototype,`iconSize`,void 0),I([E({type:Boolean})],L.prototype,`fullWidth`,void 0),I([E({type:Boolean})],L.prototype,`disabled`,void 0),L=I([T(`wui-icon-button`)],L);var Oe=C`
  button {
    display: block;
    display: flex;
    align-items: center;
    padding: ${({spacing:e})=>e[1]};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e[`ease-out-power-2`]};
    will-change: background-color;
    border-radius: ${({borderRadius:e})=>e[32]};
  }

  wui-image {
    border-radius: 100%;
  }

  wui-text {
    padding-left: ${({spacing:e})=>e[1]};
  }

  .left-icon-container,
  .right-icon-container {
    width: 24px;
    height: 24px;
    justify-content: center;
    align-items: center;
  }

  wui-icon {
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  /* -- Sizes --------------------------------------------------- */
  button[data-size='lg'] {
    height: 32px;
  }

  button[data-size='md'] {
    height: 28px;
  }

  button[data-size='sm'] {
    height: 24px;
  }

  button[data-size='lg'] wui-image {
    width: 24px;
    height: 24px;
  }

  button[data-size='md'] wui-image {
    width: 20px;
    height: 20px;
  }

  button[data-size='sm'] wui-image {
    width: 16px;
    height: 16px;
  }

  button[data-size='lg'] .left-icon-container {
    width: 24px;
    height: 24px;
  }

  button[data-size='md'] .left-icon-container {
    width: 20px;
    height: 20px;
  }

  button[data-size='sm'] .left-icon-container {
    width: 16px;
    height: 16px;
  }

  /* -- Variants --------------------------------------------------------- */
  button[data-type='filled-dropdown'] {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  button[data-type='text-dropdown'] {
    background-color: transparent;
  }

  /* -- Focus states --------------------------------------------------- */
  button:focus-visible:enabled {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    box-shadow: 0 0 0 4px ${({tokens:e})=>e.core.foregroundAccent040};
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  @media (hover: hover) and (pointer: fine) {
    button:hover:enabled,
    button:active:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }

  /* -- Disabled states --------------------------------------------------- */
  button:disabled {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    opacity: 0.5;
  }
`,R=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},ke={lg:`lg-regular`,md:`md-regular`,sm:`sm-regular`},Ae={lg:`lg`,md:`md`,sm:`sm`},z=class extends x{constructor(){super(...arguments),this.imageSrc=``,this.text=``,this.size=`lg`,this.type=`text-dropdown`,this.disabled=!1}render(){return S`<button ?disabled=${this.disabled} data-size=${this.size} data-type=${this.type}>
      ${this.imageTemplate()} ${this.textTemplate()}
      <wui-flex class="right-icon-container">
        <wui-icon name="chevronBottom"></wui-icon>
      </wui-flex>
    </button>`}textTemplate(){let e=ke[this.size];return this.text?S`<wui-text color="primary" variant=${e}>${this.text}</wui-text>`:null}imageTemplate(){return this.imageSrc?S`<wui-image src=${this.imageSrc} alt="select visual"></wui-image>`:S` <wui-flex class="left-icon-container">
      <wui-icon size=${Ae[this.size]} name="networkPlaceholder"></wui-icon>
    </wui-flex>`}};z.styles=[b,ce,Oe],R([E()],z.prototype,`imageSrc`,void 0),R([E()],z.prototype,`text`,void 0),R([E()],z.prototype,`size`,void 0),R([E()],z.prototype,`type`,void 0),R([E({type:Boolean})],z.prototype,`disabled`,void 0),z=R([T(`wui-select`)],z);var je=C`
  :host {
    height: 60px;
  }

  :host > wui-flex {
    box-sizing: border-box;
    background-color: var(--local-header-background-color);
  }

  wui-text {
    background-color: var(--local-header-background-color);
  }

  wui-flex.w3m-header-title {
    transform: translateY(0);
    opacity: 1;
  }

  wui-flex.w3m-header-title[view-direction='prev'] {
    animation:
      slide-down-out 120ms forwards ${({easings:e})=>e[`ease-out-power-2`]},
      slide-down-in 120ms forwards ${({easings:e})=>e[`ease-out-power-2`]};
    animation-delay: 0ms, 200ms;
  }

  wui-flex.w3m-header-title[view-direction='next'] {
    animation:
      slide-up-out 120ms forwards ${({easings:e})=>e[`ease-out-power-2`]},
      slide-up-in 120ms forwards ${({easings:e})=>e[`ease-out-power-2`]};
    animation-delay: 0ms, 200ms;
  }

  wui-icon-button[data-hidden='true'] {
    opacity: 0 !important;
    pointer-events: none;
  }

  @keyframes slide-up-out {
    from {
      transform: translateY(0px);
      opacity: 1;
    }
    to {
      transform: translateY(3px);
      opacity: 0;
    }
  }

  @keyframes slide-up-in {
    from {
      transform: translateY(-3px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes slide-down-out {
    from {
      transform: translateY(0px);
      opacity: 1;
    }
    to {
      transform: translateY(-3px);
      opacity: 0;
    }
  }

  @keyframes slide-down-in {
    from {
      transform: translateY(3px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`,B=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},Me=[`SmartSessionList`],Ne={PayWithExchange:se.tokens.theme.foregroundPrimary};function Pe(){let e=_.state.data?.connector?.name,t=_.state.data?.wallet?.name,n=_.state.data?.network?.name,r=t??e,i=d.getConnectors(),a=i.length===1&&i[0]?.id===`w3m-email`,o=g.getAccountData()?.socialProvider,s=o?o.charAt(0).toUpperCase()+o.slice(1):`Connect Social`;return{Connect:`Connect ${a?`Email`:``} Wallet`,Create:`Create Wallet`,ChooseAccountName:void 0,Account:void 0,AccountSettings:void 0,AllWallets:`All Wallets`,ApproveTransaction:`Approve Transaction`,BuyInProgress:`Buy`,ConnectingExternal:r??`Connect Wallet`,ConnectingWalletConnect:r??`WalletConnect`,ConnectingWalletConnectBasic:`WalletConnect`,ConnectingSiwe:`Sign In`,Convert:`Convert`,ConvertSelectToken:`Select token`,ConvertPreview:`Preview Convert`,Downloads:r?`Get ${r}`:`Downloads`,EmailLogin:`Email Login`,EmailVerifyOtp:`Confirm Email`,EmailVerifyDevice:`Register Device`,GetWallet:`Get a Wallet`,Networks:`Choose Network`,OnRampProviders:`Choose Provider`,OnRampActivity:`Activity`,OnRampTokenSelect:`Select Token`,OnRampFiatSelect:`Select Currency`,Pay:`How you pay`,ProfileWallets:`Wallets`,SwitchNetwork:n??`Switch Network`,Transactions:`Activity`,UnsupportedChain:`Switch Network`,UpgradeEmailWallet:`Upgrade Your Wallet`,UpdateEmailWallet:`Edit Email`,UpdateEmailPrimaryOtp:`Confirm Current Email`,UpdateEmailSecondaryOtp:`Confirm New Email`,WhatIsABuy:`What is Buy?`,RegisterAccountName:`Choose Name`,RegisterAccountNameSuccess:``,WalletReceive:`Receive`,WalletCompatibleNetworks:`Compatible Networks`,Swap:`Swap`,SwapSelectToken:`Select Token`,SwapPreview:`Preview Swap`,WalletSend:`Send`,WalletSendPreview:`Review Send`,WalletSendSelectToken:`Select Token`,WalletSendConfirmed:`Confirmed`,WhatIsANetwork:`What is a network?`,WhatIsAWallet:`What is a Wallet?`,ConnectWallets:`Connect Wallet`,ConnectSocials:`All Socials`,ConnectingSocial:s,ConnectingMultiChain:`Select Chain`,ConnectingFarcaster:`Farcaster`,SwitchActiveChain:`Switch Chain`,SmartSessionCreated:void 0,SmartSessionList:`Smart Sessions`,SIWXSignMessage:`Sign In`,PayLoading:`Payment in Progress`,DataCapture:`Profile`,DataCaptureOtpConfirm:`Confirm Email`,FundWallet:`Fund Wallet`,PayWithExchange:`Deposit from Exchange`,PayWithExchangeSelectAsset:`Select Asset`}}var V=class extends x{constructor(){super(),this.unsubscribe=[],this.heading=Pe()[_.state.view],this.network=g.state.activeCaipNetwork,this.networkImage=u.getNetworkImage(this.network),this.showBack=!1,this.prevHistoryLength=1,this.view=_.state.view,this.viewDirection=``,this.unsubscribe.push(oe.subscribeNetworkImages(()=>{this.networkImage=u.getNetworkImage(this.network)}),_.subscribeKey(`view`,e=>{setTimeout(()=>{this.view=e,this.heading=Pe()[e]},w.ANIMATION_DURATIONS.HeaderText),this.onViewChange(),this.onHistoryChange()}),g.subscribeKey(`activeCaipNetwork`,e=>{this.network=e,this.networkImage=u.getNetworkImage(this.network)}))}disconnectCallback(){this.unsubscribe.forEach(e=>e())}render(){let e=Ne[_.state.view]??se.tokens.theme.backgroundPrimary;return this.style.setProperty(`--local-header-background-color`,e),S`
      <wui-flex
        .padding=${[`0`,`4`,`0`,`4`]}
        justifyContent="space-between"
        alignItems="center"
      >
        ${this.leftHeaderTemplate()} ${this.titleTemplate()} ${this.rightHeaderTemplate()}
      </wui-flex>
    `}onWalletHelp(){f.sendEvent({type:`track`,event:`CLICK_WALLET_HELP`}),_.push(`WhatIsAWallet`)}async onClose(){await ge.safeClose()}rightHeaderTemplate(){let e=v?.state?.features?.smartSessions;return _.state.view!==`Account`||!e?this.closeButtonTemplate():S`<wui-flex>
      <wui-icon-button
        icon="clock"
        size="lg"
        iconSize="lg"
        type="neutral"
        variant="primary"
        @click=${()=>_.push(`SmartSessionList`)}
        data-testid="w3m-header-smart-sessions"
      ></wui-icon-button>
      ${this.closeButtonTemplate()}
    </wui-flex> `}closeButtonTemplate(){return S`
      <wui-icon-button
        icon="close"
        size="lg"
        type="neutral"
        variant="primary"
        iconSize="lg"
        @click=${this.onClose.bind(this)}
        data-testid="w3m-header-close"
      ></wui-icon-button>
    `}titleTemplate(){let e=Me.includes(this.view);return S`
      <wui-flex
        view-direction="${this.viewDirection}"
        class="w3m-header-title"
        alignItems="center"
        gap="2"
      >
        <wui-text
          display="inline"
          variant="lg-regular"
          color="primary"
          data-testid="w3m-header-text"
        >
          ${this.heading}
        </wui-text>
        ${e?S`<wui-tag variant="accent" size="md">Beta</wui-tag>`:null}
      </wui-flex>
    `}leftHeaderTemplate(){let{view:e}=_.state,t=e===`Connect`,n=v.state.enableEmbedded,r=e===`ApproveTransaction`,i=e===`ConnectingSiwe`,a=e===`Account`,o=v.state.enableNetworkSwitch,s=r||i||t&&n;return a&&o?S`<wui-select
        id="dynamic"
        data-testid="w3m-account-select-network"
        active-network=${D(this.network?.name)}
        @click=${this.onNetworks.bind(this)}
        imageSrc=${D(this.networkImage)}
      ></wui-select>`:this.showBack&&!s?S`<wui-icon-button
        data-testid="header-back"
        id="dynamic"
        icon="chevronLeft"
        size="lg"
        iconSize="lg"
        type="neutral"
        variant="primary"
        @click=${this.onGoBack.bind(this)}
      ></wui-icon-button>`:S`<wui-icon-button
      data-hidden=${!t}
      id="dynamic"
      icon="helpCircle"
      size="lg"
      iconSize="lg"
      type="neutral"
      variant="primary"
      @click=${this.onWalletHelp.bind(this)}
    ></wui-icon-button>`}onNetworks(){this.isAllowedNetworkSwitch()&&(f.sendEvent({type:`track`,event:`CLICK_NETWORKS`}),_.push(`Networks`))}isAllowedNetworkSwitch(){let e=g.getAllRequestedCaipNetworks(),t=e?e.length>1:!1,n=e?.find(({id:e})=>e===this.network?.id);return t||!n}onViewChange(){let{history:e}=_.state,t=w.VIEW_DIRECTION.Next;e.length<this.prevHistoryLength&&(t=w.VIEW_DIRECTION.Prev),this.prevHistoryLength=e.length,this.viewDirection=t}async onHistoryChange(){let{history:e}=_.state,t=this.shadowRoot?.querySelector(`#dynamic`);e.length>1&&!this.showBack&&t?(await t.animate([{opacity:1},{opacity:0}],{duration:200,fill:`forwards`,easing:`ease`}).finished,this.showBack=!0,t.animate([{opacity:0},{opacity:1}],{duration:200,fill:`forwards`,easing:`ease`})):e.length<=1&&this.showBack&&t&&(await t.animate([{opacity:1},{opacity:0}],{duration:200,fill:`forwards`,easing:`ease`}).finished,this.showBack=!1,t.animate([{opacity:0},{opacity:1}],{duration:200,fill:`forwards`,easing:`ease`}))}onGoBack(){_.goBack()}};V.styles=je,B([O()],V.prototype,`heading`,void 0),B([O()],V.prototype,`network`,void 0),B([O()],V.prototype,`networkImage`,void 0),B([O()],V.prototype,`showBack`,void 0),B([O()],V.prototype,`prevHistoryLength`,void 0),B([O()],V.prototype,`view`,void 0),B([O()],V.prototype,`viewDirection`,void 0),V=B([T(`w3m-header`)],V);var Fe=C`
  :host {
    display: flex;
    align-items: center;
    gap: ${({spacing:e})=>e[1]};
    padding: ${({spacing:e})=>e[2]} ${({spacing:e})=>e[3]}
      ${({spacing:e})=>e[2]} ${({spacing:e})=>e[2]};
    border-radius: ${({borderRadius:e})=>e[20]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    box-shadow:
      0px 0px 8px 0px rgba(0, 0, 0, 0.1),
      inset 0 0 0 1px ${({tokens:e})=>e.theme.borderPrimary};
    max-width: 320px;
  }

  wui-icon-box {
    border-radius: ${({borderRadius:e})=>e.round} !important;
    overflow: hidden;
  }

  wui-loading-spinner {
    padding: ${({spacing:e})=>e[1]};
    background-color: ${({tokens:e})=>e.core.foregroundAccent010};
    border-radius: ${({borderRadius:e})=>e.round} !important;
  }
`,Ie=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},H=class extends x{constructor(){super(...arguments),this.message=``,this.variant=`success`}render(){return S`
      ${this.templateIcon()}
      <wui-text variant="lg-regular" color="primary" data-testid="wui-snackbar-message"
        >${this.message}</wui-text
      >
    `}templateIcon(){return this.variant===`loading`?S`<wui-loading-spinner size="md" color="accent-primary"></wui-loading-spinner>`:S`<wui-icon-box
      size="md"
      color=${{success:`success`,error:`error`,warning:`warning`,info:`default`}[this.variant]}
      icon=${{success:`checkmark`,error:`warning`,warning:`warningCircle`,info:`info`}[this.variant]}
    ></wui-icon-box>`}};H.styles=[b,Fe],Ie([E()],H.prototype,`message`,void 0),Ie([E()],H.prototype,`variant`,void 0),H=Ie([T(`wui-snackbar`)],H);var Le=ue`
  :host {
    display: block;
    position: absolute;
    opacity: 0;
    pointer-events: none;
    top: 11px;
    left: 50%;
    width: max-content;
  }
`,Re=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},ze=class extends x{constructor(){super(),this.unsubscribe=[],this.timeout=void 0,this.open=y.state.open,this.unsubscribe.push(y.subscribeKey(`open`,e=>{this.open=e,this.onOpen()}))}disconnectedCallback(){clearTimeout(this.timeout),this.unsubscribe.forEach(e=>e())}render(){let{message:e,variant:t}=y.state;return S` <wui-snackbar message=${e} variant=${t}></wui-snackbar> `}onOpen(){clearTimeout(this.timeout),this.open?(this.animate([{opacity:0,transform:`translateX(-50%) scale(0.85)`},{opacity:1,transform:`translateX(-50%) scale(1)`}],{duration:150,fill:`forwards`,easing:`ease`}),this.timeout&&clearTimeout(this.timeout),y.state.autoClose&&(this.timeout=setTimeout(()=>y.hide(),2500))):this.animate([{opacity:1,transform:`translateX(-50%) scale(1)`},{opacity:0,transform:`translateX(-50%) scale(0.85)`}],{duration:150,fill:`forwards`,easing:`ease`})}};ze.styles=Le,Re([O()],ze.prototype,`open`,void 0),ze=Re([T(`w3m-snackbar`)],ze);var Be=C`
  :host {
    pointer-events: none;
  }

  :host > wui-flex {
    display: var(--w3m-tooltip-display);
    opacity: var(--w3m-tooltip-opacity);
    padding: 9px ${({spacing:e})=>e[3]} 10px ${({spacing:e})=>e[3]};
    border-radius: ${({borderRadius:e})=>e[3]};
    color: ${({tokens:e})=>e.theme.backgroundPrimary};
    position: absolute;
    top: var(--w3m-tooltip-top);
    left: var(--w3m-tooltip-left);
    transform: translate(calc(-50% + var(--w3m-tooltip-parent-width)), calc(-100% - 8px));
    max-width: calc(var(--apkt-modal-width) - ${({spacing:e})=>e[5]});
    transition: opacity ${({durations:e})=>e.lg}
      ${({easings:e})=>e[`ease-out-power-2`]};
    will-change: opacity;
    opacity: 0;
    animation-duration: ${({durations:e})=>e.xl};
    animation-timing-function: ${({easings:e})=>e[`ease-out-power-2`]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  :host([data-variant='shade']) > wui-flex {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  :host([data-variant='shade']) > wui-flex > wui-text {
    color: ${({tokens:e})=>e.theme.textSecondary};
  }

  :host([data-variant='fill']) > wui-flex {
    background-color: ${({tokens:e})=>e.theme.textPrimary};
    border: none;
  }

  wui-icon {
    position: absolute;
    width: 12px !important;
    height: 4px !important;
    color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  wui-icon[data-placement='top'] {
    bottom: 0px;
    left: 50%;
    transform: translate(-50%, 95%);
  }

  wui-icon[data-placement='bottom'] {
    top: 0;
    left: 50%;
    transform: translate(-50%, -95%) rotate(180deg);
  }

  wui-icon[data-placement='right'] {
    top: 50%;
    left: 0;
    transform: translate(-65%, -50%) rotate(90deg);
  }

  wui-icon[data-placement='left'] {
    top: 50%;
    right: 0%;
    transform: translate(65%, -50%) rotate(270deg);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`,U=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},W=class extends x{constructor(){super(),this.unsubscribe=[],this.open=P.state.open,this.message=P.state.message,this.triggerRect=P.state.triggerRect,this.variant=P.state.variant,this.unsubscribe.push(P.subscribe(e=>{this.open=e.open,this.message=e.message,this.triggerRect=e.triggerRect,this.variant=e.variant}))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){this.dataset.variant=this.variant;let e=this.triggerRect.top,t=this.triggerRect.left;return this.style.cssText=`
    --w3m-tooltip-top: ${e}px;
    --w3m-tooltip-left: ${t}px;
    --w3m-tooltip-parent-width: ${this.triggerRect.width/2}px;
    --w3m-tooltip-display: ${this.open?`flex`:`none`};
    --w3m-tooltip-opacity: ${+!!this.open};
    `,S`<wui-flex>
      <wui-icon data-placement="top" size="inherit" name="cursor"></wui-icon>
      <wui-text color="primary" variant="sm-regular">${this.message}</wui-text>
    </wui-flex>`}};W.styles=[Be],U([O()],W.prototype,`open`,void 0),U([O()],W.prototype,`message`,void 0),U([O()],W.prototype,`triggerRect`,void 0),U([O()],W.prototype,`variant`,void 0),W=U([T(`w3m-tooltip`)],W);var G={getTabsByNamespace(e){return e&&e===o.CHAIN.EVM?v.state.remoteFeatures?.activity===!1?w.ACCOUNT_TABS.filter(e=>e.label!==`Activity`):w.ACCOUNT_TABS:[]},isValidReownName(e){return/^[a-zA-Z0-9]+$/gu.test(e)},isValidEmail(e){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/gu.test(e)},validateReownName(e){return e.replace(/\^/gu,``).toLowerCase().replace(/[^a-zA-Z0-9]/gu,``)},hasFooter(){let e=_.state.view;if(w.VIEWS_WITH_LEGAL_FOOTER.includes(e)){let{termsConditionsUrl:e,privacyPolicyUrl:t}=v.state,n=v.state.features?.legalCheckbox;return!(!e&&!t||n)}return w.VIEWS_WITH_DEFAULT_FOOTER.includes(e)}},Ve=C`
  :host wui-ux-by-reown {
    padding-top: 0;
  }

  :host wui-ux-by-reown.branding-only {
    padding-top: ${({spacing:e})=>e[3]};
  }

  a {
    text-decoration: none;
    color: ${({tokens:e})=>e.core.textAccentPrimary};
    font-weight: 500;
  }
`,He=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},Ue=class extends x{constructor(){super(),this.unsubscribe=[],this.remoteFeatures=v.state.remoteFeatures,this.unsubscribe.push(v.subscribeKey(`remoteFeatures`,e=>this.remoteFeatures=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){let{termsConditionsUrl:e,privacyPolicyUrl:t}=v.state,n=v.state.features?.legalCheckbox;return!e&&!t||n?S`
        <wui-flex flexDirection="column"> ${this.reownBrandingTemplate(!0)} </wui-flex>
      `:S`
      <wui-flex flexDirection="column">
        <wui-flex .padding=${[`4`,`3`,`3`,`3`]} justifyContent="center">
          <wui-text color="secondary" variant="md-regular" align="center">
            By connecting your wallet, you agree to our <br />
            ${this.termsTemplate()} ${this.andTemplate()} ${this.privacyTemplate()}
          </wui-text>
        </wui-flex>
        ${this.reownBrandingTemplate()}
      </wui-flex>
    `}andTemplate(){let{termsConditionsUrl:e,privacyPolicyUrl:t}=v.state;return e&&t?`and`:``}termsTemplate(){let{termsConditionsUrl:e}=v.state;return e?S`<a href=${e} target="_blank" rel="noopener noreferrer"
      >Terms of Service</a
    >`:null}privacyTemplate(){let{privacyPolicyUrl:e}=v.state;return e?S`<a href=${e} target="_blank" rel="noopener noreferrer"
      >Privacy Policy</a
    >`:null}reownBrandingTemplate(e=!1){return this.remoteFeatures?.reownBranding?e?S`<wui-ux-by-reown class="branding-only"></wui-ux-by-reown>`:S`<wui-ux-by-reown></wui-ux-by-reown>`:null}};Ue.styles=[Ve],He([O()],Ue.prototype,`remoteFeatures`,void 0),Ue=He([T(`w3m-legal-footer`)],Ue);var We=ue``,Ge=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},Ke=class extends x{render(){let{termsConditionsUrl:e,privacyPolicyUrl:t}=v.state;return!e&&!t?null:S`
      <wui-flex
        .padding=${[`4`,`3`,`3`,`3`]}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap="3"
      >
        <wui-text color="secondary" variant="md-regular" align="center">
          We work with the best providers to give you the lowest fees and best support. More options
          coming soon!
        </wui-text>

        ${this.howDoesItWorkTemplate()}
      </wui-flex>
    `}howDoesItWorkTemplate(){return S` <wui-link @click=${this.onWhatIsBuy.bind(this)}>
      <wui-icon size="xs" color="accent-primary" slot="iconLeft" name="helpCircle"></wui-icon>
      How does it work?
    </wui-link>`}onWhatIsBuy(){f.sendEvent({type:`track`,event:`SELECT_WHAT_IS_A_BUY`,properties:{isSmartAccount:ie(g.state.activeChain)===c.ACCOUNT_TYPES.SMART_ACCOUNT}}),_.push(`WhatIsABuy`)}};Ke.styles=[We],Ke=Ge([T(`w3m-onramp-providers-footer`)],Ke);var qe=C`
  :host {
    display: block;
  }

  div.container {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    overflow: hidden;
    height: auto;
    display: block;
  }

  div.container[status='hide'] {
    animation: fade-out;
    animation-duration: var(--apkt-duration-dynamic);
    animation-timing-function: ${({easings:e})=>e[`ease-out-power-2`]};
    animation-fill-mode: both;
    animation-delay: 0s;
  }

  div.container[status='show'] {
    animation: fade-in;
    animation-duration: var(--apkt-duration-dynamic);
    animation-timing-function: ${({easings:e})=>e[`ease-out-power-2`]};
    animation-fill-mode: both;
    animation-delay: var(--apkt-duration-dynamic);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      filter: blur(6px);
    }
    to {
      opacity: 1;
      filter: blur(0px);
    }
  }

  @keyframes fade-out {
    from {
      opacity: 1;
      filter: blur(0px);
    }
    to {
      opacity: 0;
      filter: blur(6px);
    }
  }
`,Je=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},K=class extends x{constructor(){super(...arguments),this.resizeObserver=void 0,this.unsubscribe=[],this.status=`hide`,this.view=_.state.view}firstUpdated(){this.status=G.hasFooter()?`show`:`hide`,this.unsubscribe.push(_.subscribeKey(`view`,e=>{this.view=e,this.status=G.hasFooter()?`show`:`hide`,this.status===`hide`&&document.documentElement.style.setProperty(`--apkt-footer-height`,`0px`)})),this.resizeObserver=new ResizeObserver(e=>{for(let t of e)if(t.target===this.getWrapper()){let e=`${t.contentRect.height}px`;document.documentElement.style.setProperty(`--apkt-footer-height`,e)}}),this.resizeObserver.observe(this.getWrapper())}render(){return S`
      <div class="container" status=${this.status}>${this.templatePageContainer()}</div>
    `}templatePageContainer(){return G.hasFooter()?S` ${this.templateFooter()}`:null}templateFooter(){switch(this.view){case`Networks`:return this.templateNetworksFooter();case`Connect`:case`ConnectWallets`:case`OnRampFiatSelect`:case`OnRampTokenSelect`:return S`<w3m-legal-footer></w3m-legal-footer>`;case`OnRampProviders`:return S`<w3m-onramp-providers-footer></w3m-onramp-providers-footer>`;default:return null}}templateNetworksFooter(){return S` <wui-flex
      class="footer-in"
      padding="3"
      flexDirection="column"
      gap="3"
      alignItems="center"
    >
      <wui-text variant="md-regular" color="secondary" align="center">
        Your connected wallet may not support some of the networks available for this dApp
      </wui-text>
      <wui-link @click=${this.onNetworkHelp.bind(this)}>
        <wui-icon size="sm" color="accent-primary" slot="iconLeft" name="helpCircle"></wui-icon>
        What is a network
      </wui-link>
    </wui-flex>`}onNetworkHelp(){f.sendEvent({type:`track`,event:`CLICK_NETWORK_HELP`}),_.push(`WhatIsANetwork`)}getWrapper(){return this.shadowRoot?.querySelector(`div.container`)}};K.styles=[qe],Je([O()],K.prototype,`status`,void 0),Je([O()],K.prototype,`view`,void 0),K=Je([T(`w3m-footer`)],K);var Ye=C`
  :host {
    display: block;
    width: inherit;
  }
`,Xe=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},q=class extends x{constructor(){super(),this.unsubscribe=[],this.viewState=_.state.view,this.history=_.state.history.join(`,`),this.unsubscribe.push(_.subscribeKey(`view`,()=>{this.history=_.state.history.join(`,`),document.documentElement.style.setProperty(`--apkt-duration-dynamic`,`var(--apkt-durations-lg)`)}))}disconnectedCallback(){this.unsubscribe.forEach(e=>e()),document.documentElement.style.setProperty(`--apkt-duration-dynamic`,`0s`)}render(){return S`${this.templatePageContainer()}`}templatePageContainer(){return S`<w3m-router-container
      history=${this.history}
      .setView=${()=>{this.viewState=_.state.view}}
    >
      ${this.viewTemplate(this.viewState)}
    </w3m-router-container>`}viewTemplate(e){switch(e){case`AccountSettings`:return S`<w3m-account-settings-view></w3m-account-settings-view>`;case`Account`:return S`<w3m-account-view></w3m-account-view>`;case`AllWallets`:return S`<w3m-all-wallets-view></w3m-all-wallets-view>`;case`ApproveTransaction`:return S`<w3m-approve-transaction-view></w3m-approve-transaction-view>`;case`BuyInProgress`:return S`<w3m-buy-in-progress-view></w3m-buy-in-progress-view>`;case`ChooseAccountName`:return S`<w3m-choose-account-name-view></w3m-choose-account-name-view>`;case`Connect`:return S`<w3m-connect-view></w3m-connect-view>`;case`Create`:return S`<w3m-connect-view walletGuide="explore"></w3m-connect-view>`;case`ConnectingWalletConnect`:return S`<w3m-connecting-wc-view></w3m-connecting-wc-view>`;case`ConnectingWalletConnectBasic`:return S`<w3m-connecting-wc-basic-view></w3m-connecting-wc-basic-view>`;case`ConnectingExternal`:return S`<w3m-connecting-external-view></w3m-connecting-external-view>`;case`ConnectingSiwe`:return S`<w3m-connecting-siwe-view></w3m-connecting-siwe-view>`;case`ConnectWallets`:return S`<w3m-connect-wallets-view></w3m-connect-wallets-view>`;case`ConnectSocials`:return S`<w3m-connect-socials-view></w3m-connect-socials-view>`;case`ConnectingSocial`:return S`<w3m-connecting-social-view></w3m-connecting-social-view>`;case`DataCapture`:return S`<w3m-data-capture-view></w3m-data-capture-view>`;case`DataCaptureOtpConfirm`:return S`<w3m-data-capture-otp-confirm-view></w3m-data-capture-otp-confirm-view>`;case`Downloads`:return S`<w3m-downloads-view></w3m-downloads-view>`;case`EmailLogin`:return S`<w3m-email-login-view></w3m-email-login-view>`;case`EmailVerifyOtp`:return S`<w3m-email-verify-otp-view></w3m-email-verify-otp-view>`;case`EmailVerifyDevice`:return S`<w3m-email-verify-device-view></w3m-email-verify-device-view>`;case`GetWallet`:return S`<w3m-get-wallet-view></w3m-get-wallet-view>`;case`Networks`:return S`<w3m-networks-view></w3m-networks-view>`;case`SwitchNetwork`:return S`<w3m-network-switch-view></w3m-network-switch-view>`;case`ProfileWallets`:return S`<w3m-profile-wallets-view></w3m-profile-wallets-view>`;case`Transactions`:return S`<w3m-transactions-view></w3m-transactions-view>`;case`OnRampProviders`:return S`<w3m-onramp-providers-view></w3m-onramp-providers-view>`;case`OnRampTokenSelect`:return S`<w3m-onramp-token-select-view></w3m-onramp-token-select-view>`;case`OnRampFiatSelect`:return S`<w3m-onramp-fiat-select-view></w3m-onramp-fiat-select-view>`;case`UpgradeEmailWallet`:return S`<w3m-upgrade-wallet-view></w3m-upgrade-wallet-view>`;case`UpdateEmailWallet`:return S`<w3m-update-email-wallet-view></w3m-update-email-wallet-view>`;case`UpdateEmailPrimaryOtp`:return S`<w3m-update-email-primary-otp-view></w3m-update-email-primary-otp-view>`;case`UpdateEmailSecondaryOtp`:return S`<w3m-update-email-secondary-otp-view></w3m-update-email-secondary-otp-view>`;case`UnsupportedChain`:return S`<w3m-unsupported-chain-view></w3m-unsupported-chain-view>`;case`Swap`:return S`<w3m-swap-view></w3m-swap-view>`;case`SwapSelectToken`:return S`<w3m-swap-select-token-view></w3m-swap-select-token-view>`;case`SwapPreview`:return S`<w3m-swap-preview-view></w3m-swap-preview-view>`;case`WalletSend`:return S`<w3m-wallet-send-view></w3m-wallet-send-view>`;case`WalletSendSelectToken`:return S`<w3m-wallet-send-select-token-view></w3m-wallet-send-select-token-view>`;case`WalletSendPreview`:return S`<w3m-wallet-send-preview-view></w3m-wallet-send-preview-view>`;case`WalletSendConfirmed`:return S`<w3m-send-confirmed-view></w3m-send-confirmed-view>`;case`WhatIsABuy`:return S`<w3m-what-is-a-buy-view></w3m-what-is-a-buy-view>`;case`WalletReceive`:return S`<w3m-wallet-receive-view></w3m-wallet-receive-view>`;case`WalletCompatibleNetworks`:return S`<w3m-wallet-compatible-networks-view></w3m-wallet-compatible-networks-view>`;case`WhatIsAWallet`:return S`<w3m-what-is-a-wallet-view></w3m-what-is-a-wallet-view>`;case`ConnectingMultiChain`:return S`<w3m-connecting-multi-chain-view></w3m-connecting-multi-chain-view>`;case`WhatIsANetwork`:return S`<w3m-what-is-a-network-view></w3m-what-is-a-network-view>`;case`ConnectingFarcaster`:return S`<w3m-connecting-farcaster-view></w3m-connecting-farcaster-view>`;case`SwitchActiveChain`:return S`<w3m-switch-active-chain-view></w3m-switch-active-chain-view>`;case`RegisterAccountName`:return S`<w3m-register-account-name-view></w3m-register-account-name-view>`;case`RegisterAccountNameSuccess`:return S`<w3m-register-account-name-success-view></w3m-register-account-name-success-view>`;case`SmartSessionCreated`:return S`<w3m-smart-session-created-view></w3m-smart-session-created-view>`;case`SmartSessionList`:return S`<w3m-smart-session-list-view></w3m-smart-session-list-view>`;case`SIWXSignMessage`:return S`<w3m-siwx-sign-message-view></w3m-siwx-sign-message-view>`;case`Pay`:return S`<w3m-pay-view></w3m-pay-view>`;case`PayLoading`:return S`<w3m-pay-loading-view></w3m-pay-loading-view>`;case`FundWallet`:return S`<w3m-fund-wallet-view></w3m-fund-wallet-view>`;case`PayWithExchange`:return S`<w3m-deposit-from-exchange-view></w3m-deposit-from-exchange-view>`;case`PayWithExchangeSelectAsset`:return S`<w3m-deposit-from-exchange-select-asset-view></w3m-deposit-from-exchange-select-asset-view>`;default:return S`<w3m-connect-view></w3m-connect-view>`}}};q.styles=[Ye],Xe([O()],q.prototype,`viewState`,void 0),Xe([O()],q.prototype,`history`,void 0),q=Xe([T(`w3m-router`)],q);var Ze=C`
  :host {
    z-index: ${({tokens:e})=>e.core.zIndex};
    display: block;
    backface-visibility: hidden;
    will-change: opacity;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    opacity: 0;
    background-color: ${({tokens:e})=>e.theme.overlay};
    backdrop-filter: blur(0px);
    transition:
      opacity ${({durations:e})=>e.lg} ${({easings:e})=>e[`ease-out-power-2`]},
      backdrop-filter ${({durations:e})=>e.lg}
        ${({easings:e})=>e[`ease-out-power-2`]};
    will-change: opacity;
  }

  :host(.open) {
    opacity: 1;
    backdrop-filter: blur(8px);
  }

  :host(.appkit-modal) {
    position: relative;
    pointer-events: unset;
    background: none;
    width: 100%;
    opacity: 1;
  }

  wui-card {
    max-width: var(--apkt-modal-width);
    width: 100%;
    position: relative;
    outline: none;
    transform: translateY(4px);
    box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.05);
    transition:
      transform ${({durations:e})=>e.lg}
        ${({easings:e})=>e[`ease-out-power-2`]},
      border-radius ${({durations:e})=>e.lg}
        ${({easings:e})=>e[`ease-out-power-1`]},
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e[`ease-out-power-1`]},
      box-shadow ${({durations:e})=>e.lg}
        ${({easings:e})=>e[`ease-out-power-1`]};
    will-change: border-radius, background-color, transform, box-shadow;
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    padding: var(--local-modal-padding);
    box-sizing: border-box;
  }

  :host(.open) wui-card {
    transform: translateY(0px);
  }

  wui-card::before {
    z-index: 1;
    pointer-events: none;
    content: '';
    position: absolute;
    inset: 0;
    border-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
    transition: box-shadow ${({durations:e})=>e.lg}
      ${({easings:e})=>e[`ease-out-power-2`]};
    transition-delay: ${({durations:e})=>e.md};
    will-change: box-shadow;
  }

  :host([data-mobile-fullscreen='true']) wui-card::before {
    border-radius: 0px;
  }

  :host([data-border='true']) wui-card::before {
    box-shadow: inset 0px 0px 0px 4px ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  :host([data-border='false']) wui-card::before {
    box-shadow: inset 0px 0px 0px 1px ${({tokens:e})=>e.theme.borderPrimaryDark};
  }

  :host([data-border='true']) wui-card {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e[`ease-out-power-2`]},
      card-background-border var(--apkt-duration-dynamic)
        ${({easings:e})=>e[`ease-out-power-2`]};
    animation-fill-mode: backwards, both;
    animation-delay: var(--apkt-duration-dynamic);
  }

  :host([data-border='false']) wui-card {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e[`ease-out-power-2`]},
      card-background-default var(--apkt-duration-dynamic)
        ${({easings:e})=>e[`ease-out-power-2`]};
    animation-fill-mode: backwards, both;
    animation-delay: 0s;
  }

  :host(.appkit-modal) wui-card {
    max-width: var(--apkt-modal-width);
  }

  wui-card[shake='true'] {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e[`ease-out-power-2`]},
      w3m-shake ${({durations:e})=>e.xl}
        ${({easings:e})=>e[`ease-out-power-2`]};
  }

  wui-flex {
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  @media (max-height: 700px) and (min-width: 431px) {
    wui-flex {
      align-items: flex-start;
    }

    wui-card {
      margin: var(--apkt-spacing-6) 0px;
    }
  }

  @media (max-width: 430px) {
    :host([data-mobile-fullscreen='true']) {
      height: 100dvh;
    }
    :host([data-mobile-fullscreen='true']) wui-flex {
      align-items: stretch;
    }
    :host([data-mobile-fullscreen='true']) wui-card {
      max-width: 100%;
      height: 100%;
      border-radius: 0;
      border: none;
    }
    :host(:not([data-mobile-fullscreen='true'])) wui-flex {
      align-items: flex-end;
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card {
      max-width: 100%;
      border-bottom: none;
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card[data-embedded='true'] {
      border-bottom-left-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
      border-bottom-right-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card:not([data-embedded='true']) {
      border-bottom-left-radius: 0px;
      border-bottom-right-radius: 0px;
    }

    wui-card[shake='true'] {
      animation: w3m-shake 0.5s ${({easings:e})=>e[`ease-out-power-2`]};
    }
  }

  @keyframes fade-in {
    0% {
      transform: scale(0.99) translateY(4px);
    }
    100% {
      transform: scale(1) translateY(0);
    }
  }

  @keyframes w3m-shake {
    0% {
      transform: scale(1) rotate(0deg);
    }
    20% {
      transform: scale(1) rotate(-1deg);
    }
    40% {
      transform: scale(1) rotate(1.5deg);
    }
    60% {
      transform: scale(1) rotate(-1.5deg);
    }
    80% {
      transform: scale(1) rotate(1deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
    }
  }

  @keyframes card-background-border {
    from {
      background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    }
    to {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }

  @keyframes card-background-default {
    from {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
    to {
      background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    }
  }
`,J=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},Qe=`scroll-lock`,$e={PayWithExchange:`0`,PayWithExchangeSelectAsset:`0`},Y=class extends x{constructor(){super(),this.unsubscribe=[],this.abortController=void 0,this.hasPrefetched=!1,this.enableEmbedded=v.state.enableEmbedded,this.open=h.state.open,this.caipAddress=g.state.activeCaipAddress,this.caipNetwork=g.state.activeCaipNetwork,this.shake=h.state.shake,this.filterByNamespace=d.state.filterByNamespace,this.padding=se.spacing[1],this.mobileFullScreen=v.state.enableMobileFullScreen,this.initializeTheming(),re.prefetchAnalyticsConfig(),this.unsubscribe.push(h.subscribeKey(`open`,e=>e?this.onOpen():this.onClose()),h.subscribeKey(`shake`,e=>this.shake=e),g.subscribeKey(`activeCaipNetwork`,e=>this.onNewNetwork(e)),g.subscribeKey(`activeCaipAddress`,e=>this.onNewAddress(e)),v.subscribeKey(`enableEmbedded`,e=>this.enableEmbedded=e),d.subscribeKey(`filterByNamespace`,e=>{this.filterByNamespace!==e&&!g.getAccountData(e)?.caipAddress&&(re.fetchRecommendedWallets(),this.filterByNamespace=e)}),_.subscribeKey(`view`,()=>{this.dataset.border=G.hasFooter()?`true`:`false`,this.padding=$e[_.state.view]??se.spacing[1]}))}firstUpdated(){if(this.dataset.border=G.hasFooter()?`true`:`false`,this.mobileFullScreen&&this.setAttribute(`data-mobile-fullscreen`,`true`),this.caipAddress){if(this.enableEmbedded){h.close(),this.prefetch();return}this.onNewAddress(this.caipAddress)}this.open&&this.onOpen(),this.enableEmbedded&&this.prefetch()}disconnectedCallback(){this.unsubscribe.forEach(e=>e()),this.onRemoveKeyboardListener()}render(){return this.style.setProperty(`--local-modal-padding`,this.padding),this.enableEmbedded?S`${this.contentTemplate()}
        <w3m-tooltip></w3m-tooltip> `:this.open?S`
          <wui-flex @click=${this.onOverlayClick.bind(this)} data-testid="w3m-modal-overlay">
            ${this.contentTemplate()}
          </wui-flex>
          <w3m-tooltip></w3m-tooltip>
        `:null}contentTemplate(){return S` <wui-card
      shake="${this.shake}"
      data-embedded="${D(this.enableEmbedded)}"
      role="alertdialog"
      aria-modal="true"
      tabindex="0"
      data-testid="w3m-modal-card"
    >
      <w3m-header></w3m-header>
      <w3m-router></w3m-router>
      <w3m-footer></w3m-footer>
      <w3m-snackbar></w3m-snackbar>
      <w3m-alertbar></w3m-alertbar>
    </wui-card>`}async onOverlayClick(e){if(e.target===e.currentTarget){if(this.mobileFullScreen)return;await this.handleClose()}}async handleClose(){await ge.safeClose()}initializeTheming(){let{themeVariables:e,themeMode:t}=ee.state;le(e,de.getColorTheme(t))}onClose(){this.open=!1,this.classList.remove(`open`),this.onScrollUnlock(),y.hide(),this.onRemoveKeyboardListener()}onOpen(){this.open=!0,this.classList.add(`open`),this.onScrollLock(),this.onAddKeyboardListener()}onScrollLock(){let e=document.createElement(`style`);e.dataset.w3m=Qe,e.textContent=`
      body {
        touch-action: none;
        overflow: hidden;
        overscroll-behavior: contain;
      }
      w3m-modal {
        pointer-events: auto;
      }
    `,document.head.appendChild(e)}onScrollUnlock(){let e=document.head.querySelector(`style[data-w3m="${Qe}"]`);e&&e.remove()}onAddKeyboardListener(){this.abortController=new AbortController;let e=this.shadowRoot?.querySelector(`wui-card`);e?.focus(),window.addEventListener(`keydown`,t=>{if(t.key===`Escape`)this.handleClose();else if(t.key===`Tab`){let{tagName:n}=t.target;n&&!n.includes(`W3M-`)&&!n.includes(`WUI-`)&&e?.focus()}},this.abortController)}onRemoveKeyboardListener(){this.abortController?.abort(),this.abortController=void 0}async onNewAddress(e){let t=g.state.isSwitchingNamespace,n=_.state.view===`ProfileWallets`;e?await this.onConnected({caipAddress:e,isSwitchingNamespace:t,isInProfileView:n}):!t&&!this.enableEmbedded&&!n&&h.close(),await pe.initializeIfEnabled(e),this.caipAddress=e,g.setIsSwitchingNamespace(!1)}async onConnected(t){if(t.isInProfileView)return;let{chainNamespace:r,chainId:i,address:a}=e.parseCaipAddress(t.caipAddress),o=`${r}:${i}`,s=!n.getPlainAddress(this.caipAddress),c=await pe.getSessions({address:a,caipNetworkId:o}),l=!pe.getSIWX()||c.some(e=>e.data.accountAddress===a),u=t.isSwitchingNamespace&&l&&!this.enableEmbedded,d=this.enableEmbedded&&s;u?_.goBack():d&&h.close()}onNewNetwork(e){let t=this.caipNetwork,n=t?.caipNetworkId?.toString(),r=t?.chainNamespace,i=e?.caipNetworkId?.toString(),a=e?.chainNamespace,s=n!==i,c=s&&r===a,l=t?.name===o.UNSUPPORTED_NETWORK_NAME,u=_.state.view===`ConnectingExternal`,d=_.state.view===`ProfileWallets`,ee=!g.getAccountData(e?.chainNamespace)?.caipAddress,f=_.state.view===`UnsupportedChain`,p=h.state.open,m=!1;this.enableEmbedded&&_.state.view===`SwitchNetwork`&&(m=!0),s&&M.resetState(),p&&!u&&!d&&(ee?s&&(m=!0):(f||c&&!l)&&(m=!0)),m&&_.state.view!==`SIWXSignMessage`&&_.goBack(),this.caipNetwork=e}prefetch(){this.hasPrefetched||=(re.prefetch(),re.fetchWalletsByPage({page:1}),!0)}};Y.styles=Ze,J([E({type:Boolean})],Y.prototype,`enableEmbedded`,void 0),J([O()],Y.prototype,`open`,void 0),J([O()],Y.prototype,`caipAddress`,void 0),J([O()],Y.prototype,`caipNetwork`,void 0),J([O()],Y.prototype,`shake`,void 0),J([O()],Y.prototype,`filterByNamespace`,void 0),J([O()],Y.prototype,`padding`,void 0),J([O()],Y.prototype,`mobileFullScreen`,void 0);var et=class extends Y{};et=J([T(`w3m-modal`)],et);var tt=class extends Y{};tt=J([T(`appkit-modal`)],tt);var nt=C`
  :host {
    width: 100%;
  }
`,X=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},Z=class extends x{constructor(){super(...arguments),this.hasImpressionSent=!1,this.walletImages=[],this.imageSrc=``,this.name=``,this.size=`md`,this.tabIdx=void 0,this.disabled=!1,this.showAllWallets=!1,this.loading=!1,this.loadingSpinnerColor=`accent-100`,this.rdnsId=``,this.displayIndex=void 0,this.walletRank=void 0}connectedCallback(){super.connectedCallback()}disconnectedCallback(){super.disconnectedCallback(),this.cleanupIntersectionObserver()}updated(e){super.updated(e),(e.has(`name`)||e.has(`imageSrc`)||e.has(`walletRank`))&&(this.hasImpressionSent=!1),e.has(`walletRank`)&&this.walletRank&&!this.intersectionObserver&&this.setupIntersectionObserver()}setupIntersectionObserver(){this.intersectionObserver=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting&&!this.loading&&!this.hasImpressionSent&&this.sendImpressionEvent()})},{threshold:.1}),this.intersectionObserver.observe(this)}cleanupIntersectionObserver(){this.intersectionObserver&&=(this.intersectionObserver.disconnect(),void 0)}sendImpressionEvent(){!this.name||this.hasImpressionSent||!this.walletRank||(this.hasImpressionSent=!0,(this.rdnsId||this.name)&&f.sendWalletImpressionEvent({name:this.name,walletRank:this.walletRank,rdnsId:this.rdnsId,view:_.state.view,displayIndex:this.displayIndex}))}render(){return S`
      <wui-list-wallet
        .walletImages=${this.walletImages}
        imageSrc=${D(this.imageSrc)}
        name=${this.name}
        size=${D(this.size)}
        tagLabel=${D(this.tagLabel)}
        .tagVariant=${this.tagVariant}
        .walletIcon=${this.walletIcon}
        .tabIdx=${this.tabIdx}
        .disabled=${this.disabled}
        .showAllWallets=${this.showAllWallets}
        .loading=${this.loading}
        loadingSpinnerColor=${this.loadingSpinnerColor}
      ></wui-list-wallet>
    `}};Z.styles=nt,X([E({type:Array})],Z.prototype,`walletImages`,void 0),X([E()],Z.prototype,`imageSrc`,void 0),X([E()],Z.prototype,`name`,void 0),X([E()],Z.prototype,`size`,void 0),X([E()],Z.prototype,`tagLabel`,void 0),X([E()],Z.prototype,`tagVariant`,void 0),X([E()],Z.prototype,`walletIcon`,void 0),X([E()],Z.prototype,`tabIdx`,void 0),X([E({type:Boolean})],Z.prototype,`disabled`,void 0),X([E({type:Boolean})],Z.prototype,`showAllWallets`,void 0),X([E({type:Boolean})],Z.prototype,`loading`,void 0),X([E({type:String})],Z.prototype,`loadingSpinnerColor`,void 0),X([E()],Z.prototype,`rdnsId`,void 0),X([E()],Z.prototype,`displayIndex`,void 0),X([E()],Z.prototype,`walletRank`,void 0),Z=X([T(`w3m-list-wallet`)],Z);var rt=C`
  :host {
    --local-duration-height: 0s;
    --local-duration: ${({durations:e})=>e.lg};
    --local-transition: ${({easings:e})=>e[`ease-out-power-2`]};
  }

  .container {
    display: block;
    overflow: hidden;
    overflow: hidden;
    position: relative;
    height: var(--local-container-height);
    transition: height var(--local-duration-height) var(--local-transition);
    will-change: height, padding-bottom;
  }

  .container[data-mobile-fullscreen='true'] {
    overflow: scroll;
  }

  .page {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: auto;
    width: inherit;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border-bottom-left-radius: var(--local-border-bottom-radius);
    border-bottom-right-radius: var(--local-border-bottom-radius);
    transition: border-bottom-left-radius var(--local-duration) var(--local-transition);
  }

  .page[data-mobile-fullscreen='true'] {
    height: 100%;
  }

  .page-content {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  .footer {
    height: var(--apkt-footer-height);
  }

  div.page[view-direction^='prev-'] .page-content {
    animation:
      slide-left-out var(--local-duration) forwards var(--local-transition),
      slide-left-in var(--local-duration) forwards var(--local-transition);
    animation-delay: 0ms, var(--local-duration, ${({durations:e})=>e.lg});
  }

  div.page[view-direction^='next-'] .page-content {
    animation:
      slide-right-out var(--local-duration) forwards var(--local-transition),
      slide-right-in var(--local-duration) forwards var(--local-transition);
    animation-delay: 0ms, var(--local-duration, ${({durations:e})=>e.lg});
  }

  @keyframes slide-left-out {
    from {
      transform: translateX(0px) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
    to {
      transform: translateX(8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
  }

  @keyframes slide-left-in {
    from {
      transform: translateX(-8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
    to {
      transform: translateX(0) translateY(0) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
  }

  @keyframes slide-right-out {
    from {
      transform: translateX(0px) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
    to {
      transform: translateX(-8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
  }

  @keyframes slide-right-in {
    from {
      transform: translateX(8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
    to {
      transform: translateX(0) translateY(0) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
  }
`,Q=function(e,t,n,r){var i=arguments.length,a=i<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,n):r,o;if(typeof Reflect==`object`&&typeof Reflect.decorate==`function`)a=Reflect.decorate(e,t,n,r);else for(var s=e.length-1;s>=0;s--)(o=e[s])&&(a=(i<3?o(a):i>3?o(t,n,a):o(t,n))||a);return i>3&&a&&Object.defineProperty(t,n,a),a},it=60,$=class extends x{constructor(){super(...arguments),this.resizeObserver=void 0,this.transitionDuration=`0.15s`,this.transitionFunction=``,this.history=``,this.view=``,this.setView=void 0,this.viewDirection=``,this.historyState=``,this.previousHeight=`0px`,this.mobileFullScreen=v.state.enableMobileFullScreen,this.onViewportResize=()=>{this.updateContainerHeight()}}updated(e){if(e.has(`history`)){let e=this.history;this.historyState!==``&&this.historyState!==e&&this.onViewChange(e)}e.has(`transitionDuration`)&&this.style.setProperty(`--local-duration`,this.transitionDuration),e.has(`transitionFunction`)&&this.style.setProperty(`--local-transition`,this.transitionFunction)}firstUpdated(){this.transitionFunction&&this.style.setProperty(`--local-transition`,this.transitionFunction),this.style.setProperty(`--local-duration`,this.transitionDuration),this.historyState=this.history,this.resizeObserver=new ResizeObserver(e=>{for(let t of e)if(t.target===this.getWrapper()){let e=t.contentRect.height,n=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--apkt-footer-height`)||`0`);this.mobileFullScreen?(e=(window.visualViewport?.height||window.innerHeight)-this.getHeaderHeight()-n,this.style.setProperty(`--local-border-bottom-radius`,`0px`)):(e+=n,this.style.setProperty(`--local-border-bottom-radius`,n?`var(--apkt-borderRadius-5)`:`0px`)),this.style.setProperty(`--local-container-height`,`${e}px`),this.previousHeight!==`0px`&&this.style.setProperty(`--local-duration-height`,this.transitionDuration),this.previousHeight=`${e}px`}}),this.resizeObserver.observe(this.getWrapper()),this.updateContainerHeight(),window.addEventListener(`resize`,this.onViewportResize),window.visualViewport?.addEventListener(`resize`,this.onViewportResize)}disconnectedCallback(){let e=this.getWrapper();e&&this.resizeObserver&&this.resizeObserver.unobserve(e),window.removeEventListener(`resize`,this.onViewportResize),window.visualViewport?.removeEventListener(`resize`,this.onViewportResize)}render(){return S`
      <div class="container" data-mobile-fullscreen="${D(this.mobileFullScreen)}">
        <div
          class="page"
          data-mobile-fullscreen="${D(this.mobileFullScreen)}"
          view-direction="${this.viewDirection}"
        >
          <div class="page-content">
            <slot></slot>
          </div>
        </div>
      </div>
    `}onViewChange(e){let t=e.split(`,`).filter(Boolean),n=this.historyState.split(`,`).filter(Boolean),r=n.length,i=t.length,a=t[t.length-1]||``,o=de.cssDurationToNumber(this.transitionDuration),s=``;i>r?s=`next`:i<r?s=`prev`:i===r&&t[i-1]!==n[r-1]&&(s=`next`),this.viewDirection=`${s}-${a}`,setTimeout(()=>{this.historyState=e,this.setView?.(a)},o),setTimeout(()=>{this.viewDirection=``},o*2)}getWrapper(){return this.shadowRoot?.querySelector(`div.page`)}updateContainerHeight(){let e=this.getWrapper();if(!e)return;let t=parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--apkt-footer-height`)||`0`),n=0;this.mobileFullScreen?(n=(window.visualViewport?.height||window.innerHeight)-this.getHeaderHeight()-t,this.style.setProperty(`--local-border-bottom-radius`,`0px`)):(n=e.getBoundingClientRect().height+t,this.style.setProperty(`--local-border-bottom-radius`,t?`var(--apkt-borderRadius-5)`:`0px`)),this.style.setProperty(`--local-container-height`,`${n}px`),this.previousHeight!==`0px`&&this.style.setProperty(`--local-duration-height`,this.transitionDuration),this.previousHeight=`${n}px`}getHeaderHeight(){return it}};$.styles=[rt],Q([E({type:String})],$.prototype,`transitionDuration`,void 0),Q([E({type:String})],$.prototype,`transitionFunction`,void 0),Q([E({type:String})],$.prototype,`history`,void 0),Q([E({type:String})],$.prototype,`view`,void 0),Q([E({attribute:!1})],$.prototype,`setView`,void 0),Q([O()],$.prototype,`viewDirection`,void 0),Q([O()],$.prototype,`historyState`,void 0),Q([O()],$.prototype,`previousHeight`,void 0),Q([O()],$.prototype,`mobileFullScreen`,void 0),$=Q([T(`w3m-router-container`)],$);export{tt as AppKitModal,Z as W3mListWallet,et as W3mModal,Y as W3mModalBase,$ as W3mRouterContainer};