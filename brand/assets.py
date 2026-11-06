import numpy as np, shutil, os
from PIL import Image
B="brand/"
mark=Image.open(B+"goloc-mark.png"); mark=mark.crop(mark.getbbox())
light=Image.open(B+"goloc-logo.png"); dark=Image.open(B+"goloc-logo-dark.png")
def fit(im,size,pad,bg=(0,0,0,0)):
    W,H=size if isinstance(size,tuple) else (size,size)
    r=min(W*(1-2*pad)/im.width,H*(1-2*pad)/im.height)
    im2=im.resize((round(im.width*r),round(im.height*r)),Image.LANCZOS)
    c=Image.new("RGBA",(W,H),bg); c.alpha_composite(im2,((W-im2.width)//2,(H-im2.height)//2)); return c
WHITE=(255,255,255,255)
# wordmark (GoLoc letters, no tagline) from the logo: rows above the tagline
def wordmark(src):
    a=np.array(src)[...,3]; tx=None
    # text starts after mark: find first column gap after 15% width
    cols=a.max(0)>20; w=src.width
    xs=[x for x in range(int(w*0.15),int(w*0.5)) if not cols[x]]
    x0=xs[-1] if xs else int(w*0.3)
    txt=src.crop((x0,0,w,src.height)); ta=np.array(txt)[...,3]>20
    rows=ta.any(1); r=np.where(rows)[0]
    # split at biggest vertical gap -> letters above, tagline below
    gaps=[(r[i+1]-r[i],i) for i in range(len(r)-1)]; g,i=max(gaps)
    word=txt.crop((0,r[0],txt.width,r[i]+1)); return word.crop(word.getbbox())
def nav(word):
    h=word.height; mh=int(h*1.35); m=mark.resize((round(mark.width*mh/mark.height),mh),Image.LANCZOS)
    gap=int(h*0.22); c=Image.new("RGBA",(m.width+gap+word.width,mh),(0,0,0,0))
    c.alpha_composite(m,(0,0)); c.alpha_composite(word,(m.width+gap,(mh-h)//2+int(h*0.04))); return c
navL=nav(wordmark(light)); navD=nav(wordmark(dark))
def save(im,path,maxw=None):
    os.makedirs(os.path.dirname(path),exist_ok=True)
    if maxw and im.width>maxw: im=im.resize((maxw,round(im.height*maxw/im.width)),Image.LANCZOS)
    im.save(path,optimize=True)
save(navL,B+"goloc-nav.png",900); save(navD,B+"goloc-nav-dark.png",900)
# mobile apps
for app in ["traveler-mob","captain-mob"]:
    A=app+"/assets/"
    save(fit(mark,1024,0.16,WHITE).convert("RGB"),A+"icon.png")          # iOS/Android legacy, opaque
    save(fit(mark,1024,0.24),A+"adaptive-icon.png")                     # Android foreground (safe zone)
    a=np.array(fit(mark,1024,0.24))[...,3]
    mono=np.zeros((1024,1024,4),np.uint8); mono[...,3]=a; save(Image.fromarray(mono),A+"adaptive-monochrome.png")
    save(fit(mark,512,0.02),A+"splash-icon.png")
    n=np.array(fit(mark,96,0.06)); n[...,:3]=255; save(Image.fromarray(n),A+"notification-icon.png")
    save(fit(mark,196,0.06,WHITE).convert("RGB"),A+"favicon.png")
# shared in-app images
save(fit(mark,256,0.0),"mobile-core/assets/goloc-mark.png")
save(navD,"mobile-core/assets/goloc-nav-dark.png",600)
# web consoles + landing
for d in ["admin-desk/public/","agency-desk/public/","landing/"]:  # favicons
    save(fit(mark,64,0.04),d+"favicon.png")
    save(fit(mark,180,0.14,WHITE).convert("RGB"),d+"apple-touch-icon.png")
for d in ["admin-desk/src/assets/","agency-desk/src/assets/"]:
    save(dark,d+"goloc-logo-dark.png",700); save(light,d+"goloc-logo.png",700); save(fit(mark,128,0.0),d+"goloc-mark.png")
save(navD,"landing/goloc-nav-dark.png",600)
save(navL,"landing/goloc-nav.png",600)
save(fit(mark,560,0.0),"landing/goloc-mark.png")
og=Image.new("RGBA",(1200,630),WHITE); og.alpha_composite(fit(light,(1200,630),0.12)); save(og.convert("RGB"),"landing/og-image.png")
save(light,B+"goloc-logo.png",None)
print("done", navL.size)
