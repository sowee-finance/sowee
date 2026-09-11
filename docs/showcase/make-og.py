"""Sowee's share card: 1200x630 for Open Graph, and a 1024 square whose centre band is the same card."""
import os, subprocess, sys
HERE=os.path.dirname(os.path.abspath(__file__))
F=os.path.join(HERE,"fonts")
BOLD=f"{F}/Geist-700.ttf"; REG=f"{F}/Geist-400.ttf"
LOGO=os.path.join(HERE,"..","..","apps","web","public","favicons","white","android-chrome-512x512.png")
OUT=sys.argv[1] if len(sys.argv)>1 else HERE
MINT="#8fd0aa"

def ink(text,size,font):
    raw=subprocess.run(["ffmpeg","-v","error","-f","lavfi","-i","color=black:1600x200","-vf",
        f"drawtext=fontfile='{font}':text='{text}':fontsize={size}:fontcolor=white:x=0:y=40",
        "-frames:v","1","-f","rawvideo","-pix_fmt","gray","-"],capture_output=True,check=True).stdout
    cols=[x for x in range(1600) if any(raw[y*1600+x]>40 for y in range(0,200,2))]
    return cols[-1]-cols[0]+1

def rrect(w,h,r,rgb,alpha):
    """An anti-aliased rounded rectangle; rgb are geq expressions, alpha 0..255."""
    d=f"(hypot(max(abs(X-W/2)-(W/2-{r})\\,0)\\,max(abs(Y-H/2)-(H/2-{r})\\,0))-{r})"
    return (f"color=black@0:{w}x{h},format=rgba,geq=r='{rgb[0]}':g='{rgb[1]}':b='{rgb[2]}':"
            f"a='{alpha}*clip(0.5-{d}\\,0\\,1)'")

def ground(w,h,cx,cy,rad):
    k=f"pow(clip(1-hypot(X-{cx}\\,Y-{cy})/{rad}\\,0\\,1)\\,1.7)"
    return f"color=black:{w}x{h},format=rgb24,geq=r='12+22*{k}':g='45+82*{k}':b='29+42*{k}'"

def t(text,size,color,x,y,font=REG,alpha=1.0):
    return f"drawtext=fontfile='{font}':text='{text}':fontsize={size}:fontcolor={color}@{alpha}:x={x}:y={y}:expansion=none"

# ---- the bond card, drawn: numbers that stay true (face, discount, maturity), not a daily APY ----
CW,CH=500,316
card=[rrect(CW,CH,26,("255","255","255"),44)+"[edge]",
      rrect(CW-4,CH-4,24,("20+22*(1-(X/W*0.65+Y/H*0.35))+26*exp(-pow(X-Y*1.35-90\\,2)/9000)",
                          "58+62*(1-(X/W*0.65+Y/H*0.35))+30*exp(-pow(X-Y*1.35-90\\,2)/9000)",
                          "38+34*(1-(X/W*0.65+Y/H*0.35))+24*exp(-pow(X-Y*1.35-90\\,2)/9000)"),255)+"[fill]",
      "[edge][fill]overlay=2:2[c0]",
      rrect(56,42,9,("232-40*Y/H","196-44*Y/H","106-40*Y/H"),255)+"[chip]",
      "[c0][chip]overlay=30:76[c1]",
      "[c1]"+",".join([
        t("S O W E E",17,"white",30,32,BOLD,0.92),
        t("sINV031",17,"white",CW-30-ink("sINV031",17,REG),32,REG,0.62),
        t("$150",66,"white",30,130,BOLD),
        t("2.00% discount  ·  matures 10 Oct 2026",19,MINT,30,210,REG),
        t("Halmahera Copper Works",23,"white",30,246,BOLD),
        t("Payor  ·  Baltic Cable Systems",17,"white",30,278,REG,0.62)])
      +",scale=iw*0.86:-2,pad=iw+120:ih+120:60:60:color=black@0,rotate=-7*PI/180:c=none:ow=rotw(-7*PI/180):oh=roth(-7*PI/180),split[card][cs]",
      "[cs]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.62,boxblur=luma_radius=26:chroma_radius=26:alpha_radius=26[shadow]"]

# ---- pills for the three partners ----
pills=[]; px=80; PY=512
for i,name in enumerate(["Hedera","Arc","World ID"]):
    w=ink(name,22,BOLD)+44
    pills.append((name,px,w)); px+=w+12

def content(label):
    g=[f"color=black@0:1200x630,format=rgba[base{label}]",
       f"movie='{LOGO}',scale=58:58[mark{label}]",
       f"[base{label}][mark{label}]overlay=80:66[k0{label}]"]
    prev=f"k0{label}"
    for i,(name,x,w) in enumerate(pills):
        g.append(rrect(w,44,22,("143","208","170"),120)+f"[pe{i}{label}]")
        g.append(rrect(w-3,41,20,("22","62","42"),255)+f"[pf{i}{label}]")
        g.append(f"[pe{i}{label}][pf{i}{label}]overlay=1.5:1.5[p{i}{label}]")
        g.append(f"[{prev}][p{i}{label}]overlay={x}:{PY}[k{i+1}{label}]"); prev=f"k{i+1}{label}"
    txt=[t("Sowee",38,"white",150,76,BOLD),
         t("Invoices,",80,"white",78,170,BOLD),
         t("funded today.",80,MINT,78,258,BOLD),
         t("An unpaid invoice becomes a bond investors",27,"white",80,382,REG,0.80),
         t("fund today in USDC — paid back in full.",27,"white",80,420,REG,0.80)]
    for name,x,w in pills:
        txt.append(t(name,22,MINT,x+22,PY+11,BOLD))
    g.append(f"[{prev}]"+",".join(txt)+f"[txt{label}]")
    return g

def render(w,h,glow,content_scale,content_y,out):
    g=card+content("c")
    g.append(ground(w,h,*glow)+"[bg]")
    if content_scale!=1:
        g.append(f"[txtc]scale={int(1200*content_scale)}:-2[txs]"); layer="txs"
        g.append(f"[card]scale=iw*{content_scale}:-2[cardS];[shadow]scale=iw*{content_scale}:-2[shadowS]"); cd,sd="cardS","shadowS"
    else:
        layer,cd,sd="txtc","card","shadow"
    cx=int(648*content_scale); cy=content_y+int(96*content_scale)
    g.append(f"[bg][{sd}]overlay={cx+int(16*content_scale)}:{cy+int(34*content_scale)}[b1]")
    g.append(f"[b1][{cd}]overlay={cx}:{cy}[b2]")
    g.append(f"[b2][{layer}]overlay=0:{content_y}[out]")
    subprocess.run(["ffmpeg","-hide_banner","-v","error","-y","-filter_complex",";".join(g),"-map","[out]","-frames:v","1",out],check=True)
    print("wrote",out)

render(1200,630,(930,250,760),1,0,os.path.join(OUT,"og-1200x630.png"))
s=1024/1200
render(1024,1024,(800,440,700),s,(1024-int(630*s))//2,os.path.join(OUT,"og-square-1024.png"))
