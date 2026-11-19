# The model

Whether the object earns a stage, where its model comes from, and what the file must be before a page ships it. The numbers are starting points; none is measured by the crew.

## Whether the object earns a stage

A stage is the heaviest opening a page can have. It is earned when walking round the object shows something a picture cannot: how light answers its material, how its shadow moves, what its other side is.

- It suits a thing that is solid, opaque and compact: a shoe, a pair of headphones, a watch, a bottle, a helmet, a speaker, a camera, a chair, a tool.
- It does not suit a thing whose parts are fine or let light through. Spokes and cables, a chain, glass, a mesh, hair and fur, leaves: a tool that makes a model from a picture draws all of these badly.
- It does not suit a person or a place.
- A service and a piece of software have no object. They take the film, or a composed still.
- A plain shape standing in for a product reads as a placeholder. Geometry drawn in code suits a brand's mark, an abstract form or an atmosphere, and nothing that is sold.

Layers of flat pictures with real transparency, each moving at its own rate, give depth with no canvas at all. Take the heavier tool only where it shows more.

## Where the model comes from

Four places, and each owes something before the model is used.

- **Generated from an image.** The source picture is made to the form below, at its price and with the user's yes; then the model, at its price and with the user's yes. Where the user agrees to pay for both, a second model from another tool gives a choice between two. Whether a generated model may be used on a commercial site depends on the tool's terms and the account's plan: the session reads those terms where it can, says what it found, and does not answer the question.
- **Bought or downloaded.** Its licence is read and recorded on the item: it must allow use on a client's commercial site. A licence for editorial use does not. No model is taken out of another site.
- **The client's own.** A studio's file or an export from the client's design tool. Open it and look: a file's name is no proof of what is in it. Such exports are far heavier than a generated model and need the processing below.
- **Drawn in code.** Said so in the storyboard. It costs no download.

With no tool that makes a model and no model, there is no stage. The session says that plainly, and the page takes the film or the composed still.

## The picture a model is generated from

A tool copies what it is shown, so this picture decides the model. It is a second picture, made for the tool, and not the page's own opening picture.

```text
Subject: the object alone, whole in frame, with margin on every side.
View: from the front and a little to one side, at the object's own height.
Ground: plain and seamless, mid-grey.
Light: soft and even, with no hard shadow.
Nothing else: no props, no surface reflecting it, no blur of movement. No text.
Shape of the picture: square.
```

For a long object with thin parts (wheels, a frame one can see through), a plain side view in a wide picture serves better, and the tool is asked for more triangles.

## One self-contained file

The model a page ships is one self-contained binary file, `.glb`, with no outside address in it. A model file can name its pictures and buffers by address, and one that does would make every visitor's browser ask the host it names. Read what `gltf-transform inspect` prints, or the file's own index, before the model is used: a file that names anything outside itself is refused, and made whole or made again. The stage's engine refuses such a file too, to the poster.

## Processing

A generated model arrives at many megabytes. glTF-Transform, a command-line tool, makes it small. The session uses it only where it is already on the machine; where it is not, the session says so and what it would fetch, and the user decides.

Look first:

```text
gltf-transform inspect raw/model.glb
```

It prints the meshes with their counts of triangles, the textures with their sizes, and what the file names outside itself.

Then make it small. The tool's own page gives this form, and warns that its defaults do not suit every scene:

```text
gltf-transform optimize raw/model.glb work/model.glb --texture-compress webp
gltf-transform meshopt work/model.glb assets/model.glb
```

The first rewrites the textures as WebP; the second packs the geometry in a form whose decoder is inside three.js, so no extra file ships. The options that limit a texture's size and that thin the mesh are read from what `gltf-transform optimize -h` prints on the machine, and the command is written from that: they are not given here, because they were not read on a page the crew opened.

Starting points, each its source's and none the crew's:

- a model file under about 6 MB; the engine does not load a larger one;
- textures no larger than 2048 pixels on a side;
- about 150,000 triangles as the most a generated model is asked for, where its parts are thin.

A step that thins the mesh can cost the very part a close view shows. Look at the result on the review page each time, and go back a step where that part has gone soft.

The raw model, the source picture and the review's captures stay out of the folder that ships and out of commits.
