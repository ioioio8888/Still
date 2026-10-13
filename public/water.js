// GPU ink advection with pressure projection. No external library or remote assets.
export function attachWater(canvas,toggle,t) {
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:true});
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let preference=null;try{preference=localStorage.getItem('still-ripples');}catch{}
 let automatic=preference==='on'||(preference!=='off'&&!reduced.matches);
 const clearButton=document.querySelector('#clear-water');
 if(!gl||!gl.getExtension('EXT_color_buffer_float')){
  canvas.dataset.renderer='fallback';canvas.classList.add('ink-fallback');toggle.textContent=t('waterUnavailable');toggle.disabled=true;
  if(clearButton)clearButton.hidden=true;
  return ()=>{};
 }
 canvas.dataset.renderer='webgl2';
 const vertex=`#version 300 es
 in vec2 position;out vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
 const head=`#version 300 es
 precision highp float;in vec2 uv;out vec4 outputColor;uniform sampler2D source;uniform sampler2D velocity;uniform sampler2D pressure;uniform sampler2D divergence;uniform vec2 pixel;uniform float dt;`;
 const programs=[],textures=[],buffers=[];
 function program(fragment){
  const compile=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(message);}return s;};
  const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,head+fragment),p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));programs.push(p);return p;
 }
 let shaders;
 try{shaders={
  advect:program(`uniform float decay;vec4 sampleSmooth(sampler2D tex,vec2 point){vec2 size=vec2(textureSize(tex,0));vec2 p=point*size-.5;vec2 i=floor(p);vec2 f=fract(p);return mix(mix(texture(tex,(i+.5)/size),texture(tex,(i+vec2(1.5,.5))/size),f.x),mix(texture(tex,(i+vec2(.5,1.5))/size),texture(tex,(i+1.5)/size),f.x),f.y);}void main(){vec2 v=sampleSmooth(velocity,uv).xy;outputColor=sampleSmooth(source,uv-dt*v*pixel)*decay;}`),
  splat:program(`uniform vec2 point;uniform vec3 value;uniform float radius;uniform float aspect;uniform float banded;void main(){vec2 d=uv-point;d.x*=aspect;float r=length(d);float falloff=exp(-dot(d,d)/radius);float bands=mix(1.,.65+.35*sin(r*1050.),banded);outputColor=texture(source,uv)+vec4(value*falloff*bands,0.);}`),
  curl:program(`void main(){float l=texture(velocity,uv-vec2(pixel.x,0)).y;float r=texture(velocity,uv+vec2(pixel.x,0)).y;float b=texture(velocity,uv-vec2(0,pixel.y)).x;float a=texture(velocity,uv+vec2(0,pixel.y)).x;outputColor=vec4(.5*(r-l-a+b),0,0,1);}`),
  vorticity:program(`void main(){float l=abs(texture(source,uv-vec2(pixel.x,0)).x);float r=abs(texture(source,uv+vec2(pixel.x,0)).x);float b=abs(texture(source,uv-vec2(0,pixel.y)).x);float a=abs(texture(source,uv+vec2(0,pixel.y)).x);float c=texture(source,uv).x;vec2 f=.5*vec2(a-b,r-l);f/=length(f)+.0001;f*=c*17.;f.y*=-1.;outputColor=vec4(clamp(texture(velocity,uv).xy+dt*f,vec2(-120),vec2(120)),0,1);}`),
  divergence:program(`void main(){vec2 c=texture(velocity,uv).xy;float l=uv.x<pixel.x?-c.x:texture(velocity,uv-vec2(pixel.x,0)).x;float r=uv.x>1.-pixel.x?-c.x:texture(velocity,uv+vec2(pixel.x,0)).x;float b=uv.y<pixel.y?-c.y:texture(velocity,uv-vec2(0,pixel.y)).y;float a=uv.y>1.-pixel.y?-c.y:texture(velocity,uv+vec2(0,pixel.y)).y;outputColor=vec4(.5*(r-l+a-b),0,0,1);}`),
  pressure:program(`void main(){float l=texture(pressure,uv-vec2(pixel.x,0)).x;float r=texture(pressure,uv+vec2(pixel.x,0)).x;float b=texture(pressure,uv-vec2(0,pixel.y)).x;float a=texture(pressure,uv+vec2(0,pixel.y)).x;outputColor=vec4((l+r+b+a-texture(divergence,uv).x)*.25,0,0,1);}`),
  project:program(`void main(){float l=texture(pressure,uv-vec2(pixel.x,0)).x;float r=texture(pressure,uv+vec2(pixel.x,0)).x;float b=texture(pressure,uv-vec2(0,pixel.y)).x;float a=texture(pressure,uv+vec2(0,pixel.y)).x;outputColor=vec4(texture(velocity,uv).xy-.5*vec2(r-l,a-b),0,1);}`),
  clear:program(`uniform float retain;void main(){outputColor=texture(source,uv)*retain;}`),
  display:program(`uniform float aspect;float random(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}void main(){vec3 ink=texture(source,uv).rgb;float edge=smoothstep(0.,.16,uv.x)*smoothstep(0.,.16,uv.y)*smoothstep(0.,.16,1.-uv.x)*smoothstep(0.,.16,1.-uv.y);vec3 paper=vec3(.9294,.9490,.9373);float grain=(random(gl_FragCoord.xy)-.5)*.008;vec3 absorption=vec3(.75,.42,.38)*ink.r+vec3(.64,.54,.39)*ink.g+vec3(.76,.57,.42)*ink.b;vec3 color=paper*exp(-absorption*edge*2.5);outputColor=vec4(color+grain,1);}`)
 };}catch(error){console.error('Ink renderer unavailable:',error.message);for(const p of programs)gl.deleteProgram(p);canvas.dataset.renderer='fallback';canvas.classList.add('ink-fallback');toggle.textContent=t('waterUnavailable');toggle.disabled=true;if(clearButton)clearButton.hidden=true;return ()=>{};}
 const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 function target(width,height){const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,width,height,0,gl.RGBA,gl.HALF_FLOAT,null);const framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Ink framebuffer unsupported');gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);textures.push(texture);buffers.push(framebuffer);return{texture,framebuffer,width,height};}
 const pair=(w,h)=>({read:target(w,h),write:target(w,h),swap(){[this.read,this.write]=[this.write,this.read];}});
 const rect=canvas.getBoundingClientRect(),aspect=Math.max(.5,rect.width/rect.height),simH=112,simW=Math.round(simH*aspect),dyeH=rect.width<500?320:512,dyeW=Math.round(dyeH*aspect);
 let flow,dye,pressure,curl,div;
 try{flow=pair(simW,simH);dye=pair(dyeW,dyeH);pressure=pair(simW,simH);curl=target(simW,simH);div=target(simW,simH);}catch(error){console.error(error.message);for(const p of programs)gl.deleteProgram(p);for(const texture of textures)gl.deleteTexture(texture);for(const framebuffer of buffers)gl.deleteFramebuffer(framebuffer);gl.deleteBuffer(quad);canvas.dataset.renderer='fallback';canvas.classList.add('ink-fallback');toggle.textContent=t('waterUnavailable');toggle.disabled=true;if(clearButton)clearButton.hidden=true;return ()=>{};}
 function pass(p,destination,uniforms){gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const attr=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);let unit=0;for(const [name,value] of Object.entries(uniforms)){const location=gl.getUniformLocation(p,name);if(location===null)continue;if(value?.texture){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,value.texture);gl.uniform1i(location,unit++);}else if(Array.isArray(value)){if(value.length===2)gl.uniform2f(location,...value);else gl.uniform3f(location,...value);}else gl.uniform1f(location,value);}gl.bindFramebuffer(gl.FRAMEBUFFER,destination?.framebuffer||null);gl.viewport(0,0,destination?.width||canvas.width,destination?.height||canvas.height);gl.drawArrays(gl.TRIANGLES,0,6);}
 const pixel=[1/simW,1/simH];let raf=0,disposed=false,lastTime=0,lastAuto=0,lastInput=0,previous=null,down=false,wash=0;
 const active=()=>automatic;
 function display(){pass(shaders.display,null,{source:dye.read,aspect});}
 function splat(x,y,dx,dy,amount=.22){pass(shaders.splat,flow.write,{source:flow.read,point:[x,y],value:[dx,dy,0],radius:.004,aspect,banded:0});flow.swap();const color=Math.floor((x+y)*7)%3;const value=[.035,.035,.035];value[color]=amount;pass(shaders.splat,dye.write,{source:dye.read,point:[x,y],value,radius:.0022,aspect,banded:1});dye.swap();}
 function step(dt){
  pass(shaders.advect,flow.write,{source:flow.read,velocity:flow.read,pixel,dt,decay:.996});flow.swap();
  pass(shaders.curl,curl,{velocity:flow.read,pixel});pass(shaders.vorticity,flow.write,{source:curl,velocity:flow.read,pixel,dt});flow.swap();
  pass(shaders.divergence,div,{velocity:flow.read,pixel});pass(shaders.clear,pressure.write,{source:pressure.read,retain:.7});pressure.swap();
  for(let i=0;i<12;i++){pass(shaders.pressure,pressure.write,{pressure:pressure.read,divergence:div,pixel});pressure.swap();}
  pass(shaders.project,flow.write,{velocity:flow.read,pressure:pressure.read,pixel});flow.swap();
  pass(shaders.advect,dye.write,{source:dye.read,velocity:flow.read,pixel,dt,decay:wash>0?.91:.9993});dye.swap();if(wash>0)wash--;
 }
 function seed(){for(let i=0;i<20;i++){const q=i/19,a=q*5.4,x=.28+q*.42+Math.sin(a)*.12,y=.23+q*.52;splat(x,y,Math.cos(a)*48,Math.sin(a)*28,1.1);}for(let i=0;i<28;i++)step(.016);display();}
 function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));display();}
 function tick(time){raf=0;if(disposed||document.hidden)return;const dt=Math.min(.025,Math.max(.008,(time-lastTime)/1000||.016));lastTime=time;if(active()&&time-lastAuto>3700&&time-lastInput>1800){const a=time*.00012;splat(.5+Math.cos(a)*.22,.5+Math.sin(a*1.3)*.2,Math.sin(a)*22,Math.cos(a)*22,.18);lastAuto=time;}step(dt);display();if(active()||(!reduced.matches&&time-lastInput<3500)||wash>0)raf=requestAnimationFrame(tick);}
 function wake(){if(!raf&&!document.hidden&&!disposed)raf=requestAnimationFrame(tick);}
 function paintInput(event){if(event.type==='pointermove'&&(event.pointerType!=='mouse'&&!down))return;const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,y=1-(event.clientY-r.top)/r.height;const now=performance.now();if(event.type==='pointermove'&&now-lastInput<24)return;const dx=previous?(x-previous.x)*simW*7:12,dy=previous?(y-previous.y)*simH*7:8;previous={x,y};lastInput=now;splat(x,y,Math.max(-90,Math.min(90,dx)),Math.max(-90,Math.min(90,dy)),down?.27:.085);if(reduced.matches&&!automatic){step(.016);display();}else wake();}
 function start(event){down=true;previous=null;canvas.setPointerCapture(event.pointerId);paintInput(event);}
 function end(){down=false;previous=null;}
 function key(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();lastInput=performance.now();splat(.5,.5,30,15,.7);if(reduced.matches&&!automatic){step(.016);display();}else wake();}}
 function update(){toggle.textContent=t(!preference&&reduced.matches?'motionReduced':automatic?'motionOn':'motionOff');toggle.disabled=false;toggle.setAttribute('aria-pressed',String(active()));cancelAnimationFrame(raf);raf=0;if(active())wake();else display();}
 function visibility(){cancelAnimationFrame(raf);raf=0;if(!document.hidden&&active())wake();}
 function lost(event){event.preventDefault();cancelAnimationFrame(raf);raf=0;disposed=true;toggle.disabled=true;toggle.textContent=t('waterUnavailable');canvas.dataset.renderer='lost';if(clearButton)clearButton.disabled=true;}
 toggle.onclick=()=>{automatic=!automatic;preference=automatic?'on':'off';try{localStorage.setItem('still-ripples',preference);}catch{}update();};
 if(clearButton)clearButton.onclick=()=>{if(reduced.matches&&!automatic){pass(shaders.clear,dye.write,{source:dye.read,retain:0});dye.swap();display();}else{wash=65;wake();}};
 canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',paintInput);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',end);canvas.addEventListener('keydown',key);canvas.addEventListener('webglcontextlost',lost);
 document.addEventListener('visibilitychange',visibility);function systemMotion(){if(!preference)automatic=!reduced.matches;update();}reduced.addEventListener('change',systemMotion);const observer=new ResizeObserver(resize);observer.observe(canvas);resize();seed();update();
 return()=>{disposed=true;observer.disconnect();cancelAnimationFrame(raf);canvas.removeEventListener('pointerdown',start);canvas.removeEventListener('pointermove',paintInput);canvas.removeEventListener('pointerup',end);canvas.removeEventListener('pointercancel',end);canvas.removeEventListener('pointerleave',end);canvas.removeEventListener('keydown',key);canvas.removeEventListener('webglcontextlost',lost);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',systemMotion);toggle.onclick=null;if(clearButton)clearButton.onclick=null;for(const p of programs)gl.deleteProgram(p);for(const texture of textures)gl.deleteTexture(texture);for(const framebuffer of buffers)gl.deleteFramebuffer(framebuffer);gl.deleteBuffer(quad);gl.getExtension('WEBGL_lose_context')?.loseContext();};
}
