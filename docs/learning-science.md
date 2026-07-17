# The science of learning — Atlas's evidence base

> **About this doc:** the research behind the learning claims in [vision.md](./vision.md). A reading
> list, not a rulebook. Every link below was fetched and confirmed to resolve; where a publisher
> page blocks bots, an open PDF or the DOI is given instead. Peer-reviewed vs. popular/practitioner
> sources are flagged honestly. ★ = read these first.

## The one finding that shapes the product

A beautiful reading experience, by itself, produces the *feeling* of learning — not learning. This
is the most-replicated result in the field (the **fluency illusion**). The fix is to embed
**retrieval** into reading and **space** it over time. Everything below supports that.

## A. Memory & retrieval — how things stick

- ★ **Dunlosky et al. (2013), "Improving Students' Learning With Effective Learning Techniques."**
  Ranks 10 study techniques; only **practice testing** and **distributed practice** rate "high",
  while highlighting/rereading rate "low." →
  [open PDF](https://www.whz.de/fileadmin/lehre/hochschuldidaktik/docs/dunloskiimprovingstudentlearning.pdf)
  · [summary](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html)
- ★ **Roediger & Karpicke (2006), "Test-Enhanced Learning."** The testing effect: recall beats
  rereading for long-term retention. →
  [open PDF](http://psychnet.wustl.edu/memory/wp-content/uploads/2018/04/Roediger-Karpicke-2006_PsychSci.pdf)
- **Karpicke & Blunt (2011), Science.** Retrieval practice beat elaborate concept-mapping — even
  when the final test *was* a concept map. →
  [open PDF](https://learninglab.psych.purdue.edu/downloads/2011/2011_Karpicke_Blunt_Science.pdf)
- **Cepeda et al. (2006), spacing meta-analysis (317 experiments).** Distributed practice beats
  cramming; the optimal gap grows with target retention interval. →
  [open PDF](https://augmentingcognition.com/assets/Cepeda2006.pdf) ·
  [Cepeda 2008 (optimal gaps)](https://files.eric.ed.gov/fulltext/ED505660.pdf)
- **Murre & Dros (2015), replication of Ebbinghaus's forgetting curve (PLOS ONE).** →
  [open access](https://doi.org/10.1371/journal.pone.0120644)
- **Bjork & Bjork (2011), "Making things hard on yourself, but in a good way."** Desirable
  difficulties — *learning ≠ performance*; easy often teaches least. →
  [open PDF](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf)
- **Rohrer & Taylor (2007), interleaving.** Mixing problem types feels worse, tests better. →
  [open PDF](http://uweb.cas.usf.edu/~drohrer/pdfs/Rohrer&Taylor2007IS.pdf)
- **Slamecka & Graf (1978), the generation effect.** You remember what you *produce* better than
  what you read. → [open PDF](https://andymatuschak.org/prompts/Slamecka1978.pdf)
- **Applied scheduling tech** (engineering, not cognitive science):
  [SM-2 / SuperMemo](https://www.supermemo.com/en/archives1990-2015/english/ol/sm2) and modern
  [FSRS](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler) (Anki's
  default; Difficulty-Stability-Retrievability). Peer-reviewed lineage:
  [Ye et al. 2022, KDD](https://doi.org/10.1145/3534678.3539081). **FSRS is the algorithm we'd
  implement for resurfacing.**

## B. Comprehension, cognitive load & media design — how the experience helps or hurts

- ★ **Sweller (1988), Cognitive Load Theory.** Working memory is tiny; anything that makes the
  reader "figure out the interface" steals capacity from the idea. →
  [open PDF](https://mrbartonmaths.com/resourcesnew/8.%20Research/Explicit%20Instruction/Cognitive%20Load%20during%20problem%20solving.pdf)
  · [2019 update](https://leadinglearner.me/wp-content/uploads/2019/02/sweller2019_article_cognitivearchitectureandinstru.pdf)
- **Mayer's Multimedia Learning principles** (coherence, signalling, redundancy, spatial/temporal
  contiguity, segmenting, modality). →
  [Cambridge Handbook](https://www.cambridge.org/core/books/cambridge-handbook-of-multimedia-learning/09E09224829AB8D3D327EF8A0E9B5288)
- **Paivio, Dual Coding Theory.** Text + relevant imagery beats text alone. →
  [Internet Archive](https://archive.org/details/mentalrepresenta0000paiv)
- **Delgado et al. (2018), "Don't throw away your printed books" (meta-analysis, ~171k people).**
  Screens carry a small but real comprehension penalty, *worst under time pressure*. →
  [DOI](https://doi.org/10.1016/j.edurev.2018.09.003)
- **Signalling / typographic hierarchy aids comprehension:** [Lorch 1989](https://doi.org/10.1007/BF01320135)
  · [Mautone & Mayer 2001](https://doi.org/10.1037/0022-0663.93.2.377)
- **Chi et al. (1994), the self-explanation effect.** Prompting learners to explain *why* builds
  deeper models than rereading. → [DOI](https://doi.org/10.1207/s15516709cog1803_3)
- **The note-taking myth, honestly:** [Mueller & Oppenheimer 2014 "Pen Is Mightier"](https://doi.org/10.1177/0956797614524581)
  **failed to replicate** ([Morehead 2019](https://doi.org/10.1007/s10648-019-09468-2),
  [Urry 2021](https://doi.org/10.1177/0956797620965541)). Durable lesson: *paraphrasing beats
  verbatim, in any medium.*

## C. Motivation, metacognition & modern tools for thought

- ★ **Matuschak (2019), "Why books don't work."** The manifesto for reading-first learning tools. →
  [read it](https://andymatuschak.org/books/)
- **Matuschak & Nielsen — the mnemonic medium:** [essay](https://numinous.productions/ttft/) ·
  [Quantum Country](https://quantum.country/). *Atlas's single most important design reference.*
- **Kornell & Bjork (2007), the fluency illusion.** Rereading feels like learning because it's
  easy, and that ease fools you. →
  [PDF](https://web.williams.edu/Psychology/Faculty/Kornell/Publications/Kornell.Bjork.2007.pdf) ·
  [broader review 2013](https://sanlab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/RBjork_Dunlosky_Kornell_2012.pdf)
- **Gruber, Gelman & Ranganath (2014), curiosity & memory (Neuron).** A curious brain state primes
  the hippocampus — even *incidental* things stick better. →
  [open access](https://pmc.ncbi.nlm.nih.gov/articles/PMC4252494/)
- **Diekelmann & Born (2010), "The Memory Function of Sleep" (Nature Rev. Neuro).** Sleep actively
  consolidates and reorganises memory — learning finishes overnight (resurface the *next* day). →
  [link](https://www.nature.com/articles/nrn2762)
- **Atomic, linked notes:** [Matuschak's Evergreen Notes](https://notes.andymatuschak.org/Evergreen_notes)
  · [Luhmann's Zettelkasten](https://zettelkasten.de/introduction/). The ancestors of the graph.
- **Gateways (popularised, ground load-bearing claims in the primaries above):**
  [*Learning How to Learn* MOOC](https://www.coursera.org/learn/learning-how-to-learn) (focused/
  diffuse framing is a popularisation), [Feynman technique](https://fs.blog/feynman-technique/),
  Tiago Forte's [progressive summarization](https://fortelabs.com/blog/progressive-summarization-a-practical-technique-for-designing-discoverable-notes/)
  (practitioner, not peer-reviewed).
