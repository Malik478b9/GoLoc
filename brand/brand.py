# Regenerate: python brand/brand.py && python brand/assets.py   (run from the repo root; needs Pillow + numpy)
import numpy as np
from PIL import Image
I="brand/original/"
O="brand/"
def trim(im):
    return im.crop(im.getbbox())
# ---- mark (no TM)
m=np.array(Image.open(I+"goloc-mark-original.png").convert("RGBA"))
reg=m[100:320,880:1100].astype(int)
tm=(reg[...,:3].sum(-1)<330)|((reg[...,3]<255)&(reg[...,:3].sum(-1)<450))
# grow TM mask by 3px to catch antialias
from PIL import ImageFilter
mask=Image.fromarray((tm*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
mk=np.array(mask)>0
# only erase pixels that are dark-ish or translucent (keep bright teal arc)
sub=m[100:320,880:1100]
bright=(sub[...,1].astype(int)>150)&(sub[...,3]>200)
sub[mk&~bright]=0
mark_shadow=trim(Image.fromarray(m))
# shadow-free: drop low-saturation pixels near bottom
n=np.array(mark_shadow).copy()
h=n.shape[0]
sat=n[...,:3].max(-1).astype(int)-n[...,:3].min(-1)
low=(sat<45)
n[int(h*0.85):][low[int(h*0.85):]]=0
mark=trim(Image.fromarray(n))
def square(im,size,pad):
    w,h=im.size; s=int(size*(1-2*pad)); r=s/max(w,h)
    im2=im.resize((max(1,round(w*r)),max(1,round(h*r))),Image.LANCZOS)
    c=Image.new("RGBA",(size,size),(0,0,0,0)); c.paste(im2,((size-im2.width)//2,(size-im2.height)//2),im2); return c
square(mark,1024,0.02).save(O+"goloc-mark.png")
mark_shadow.save(O+"_mark_shadow.png")
# ---- lockup text from full logo (white -> alpha)
f=np.array(Image.open(I+"goloc-logo-original.png").convert("RGB")).astype(float)
t=f[:,760:1960]
alpha=(255-t).max(-1)/255
a=np.clip(alpha,1e-6,1)
col=(t-255*(1-a[...,None]))/a[...,None]
alpha2=np.clip(alpha*1.5,0,1); alpha2[alpha<0.06]=0
txt=np.dstack([np.clip(col,0,255),alpha2*255]).astype(np.uint8)
text=Image.fromarray(txt)
# mark sized like original: original mark spans rows of nonwhite in cols 286..744
mm=(f[:,286:745].min(-1)<225); rows=np.where(mm.any(1))[0]
mh=rows.max()-rows.min()+1; mw=745-286
ms=mark_shadow; r=mh/ms.height
ms2=ms.resize((round(ms.width*r),round(ms.height*r)),Image.LANCZOS)
H,W=f.shape[:2]
canvas=Image.new("RGBA",(W+200,H),(0,0,0,0))
cx=286+mw//2
canvas.paste(ms2,(cx-ms2.width//2, rows.min()),ms2)
canvas.alpha_composite(text,(760,0))
bb=canvas.getbbox(); light=canvas.crop(bb); light.save(O+"goloc-logo.png")
text_x=760-bb[0]
# dark variant: navy/low-saturation dark text pixels -> white
d=np.array(light).copy().astype(int)
x0=light.width*0 # whole image but protect mark: mark is left part
markw=round((ms2.width)/1)  # approx width of mark in trimmed image
rgb=d[...,:3]; s=rgb.max(-1)-rgb.min(-1)
teal=(rgb[...,1]>90)&(rgb[...,1]-rgb[...,0]>50)
navy=~teal
navy[:, :text_x]=False
d[...,:3][navy]=255
Image.fromarray(d.astype(np.uint8)).save(O+"goloc-logo-dark.png")
print(mark.size, light.size)
