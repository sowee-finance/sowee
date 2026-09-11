
import subprocess, sys, json
import os
HERE=os.path.dirname(os.path.abspath(__file__))
BOLD=os.path.join(HERE,"fonts","Geist-700.ttf")   # static TrueType: ffmpeg's freetype cannot read
REG=os.path.join(HERE,"fonts","Geist-400.ttf")    # .woff2 and falls back to DejaVu without a word
BG="#0c2d1d"; W=H=1620; PAD=88; CARD_W=W-2*PAD; R=22
HEAD_SIZE=76; SUB_SIZE=31; GAP=130

def esc(t): return t.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")

def build(src, heading, sub_lines, out):
    p=json.loads(subprocess.run(["ffprobe","-v","error","-show_entries","stream=width,height","-of","json",src],capture_output=True,text=True).stdout)
    sw,sh=p["streams"][0]["width"],p["streams"][0]["height"]
    ch=int(round(CARD_W*sh/sw)); ch-=ch%2
    text_h = HEAD_SIZE + 36 + 44*len(sub_lines)
    free = H - (text_h + GAP + ch)
    head_y = int(free*0.54)                      # a touch more air above than below
    card_y = head_y + text_h + GAP
    rounded=("[1:v]scale=%d:%d,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':"
             "a='if(gt(abs(X-(W/2)),(W/2-%d))*gt(abs(Y-(H/2)),(H/2-%d)),"
             "if(lte(hypot(abs(X-(W/2))-(W/2-%d),abs(Y-(H/2))-(H/2-%d)),%d),255,0),255)'[card]") % (CARD_W,ch,R,R,R,R,R)
    chain=[rounded, "[0:v][card]overlay=%d:%d[base]" % (PAD, card_y)]
    t=["drawtext=fontfile='%s':text='%s':fontcolor=white:fontsize=%d:x=%d:y=%d"
       % (BOLD, esc(heading), HEAD_SIZE, PAD, head_y)]
    y=head_y+HEAD_SIZE+36
    for ln in sub_lines:
        t.append("drawtext=fontfile='%s':text='%s':fontcolor=#8fd0aa:fontsize=%d:x=%d:y=%d" % (REG, esc(ln), SUB_SIZE, PAD, y))
        y+=44
    chain.append("[base]" + ",".join(t) + "[out]")
    subprocess.run(["ffmpeg","-hide_banner","-v","error","-y","-f","lavfi","-i","color=%s:%dx%d"%(BG,W,H),
                    "-i",src,"-filter_complex",";".join(chain),"-map","[out]","-frames:v","1",out],check=True)
    print("  %-20s card %dx%d  head y=%d  card y=%d  bottom %d" % (out, CARD_W, ch, head_y, card_y, H-card_y-ch))

if __name__=="__main__":
    build(*json.loads(sys.argv[1]))

