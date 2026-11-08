## Inspiration
From struggling with tedious latex writing for math in our discrete math class, we wanted a solution, a better way to note take and complete latex for our assignments. 

## What it does
Lawrite is a notetaking system that allows the user to write out notes on their mobile device/tablet and have it easily and accurately converted into latex in for easy their personal use on their computer. The real benefit is the easy sharing of handwriting to latex on your computer without having to deal with any middle step. It makes things super easy

## How we built it
We built LaWrite. as a shared math workspace with Next.js and React. A pressure-sensitive drawing canvas lets you write equations on a tablet, while the computer view mirrors the page and supports selecting an expression for recognition. 

We use a self hosted ML model pix2text api to convert selected handwriting into editable LaTeX, then render a preview with MathJax. Drawing updates are saved through the app’s API so both views can stay in sync for the users use.

## Challenges we ran into
We spent a long time, trying to figure out how to actually convert handwriting into latex. It became our largest challenge. There were a few options but many were expensive or outdated. We ended up with this public model "pix2text" which is running locally on our computer. The actual web functionality is fairly simple.

## Accomplishments that we're proud of
Learning about how to run our own model and use it in an api. We are very proud of making an app that regardless of how we do in the competition, we will use on our own work.

## What's next for LaWrite
First thing is to make a complete mobile app with file storage and complete the notes aspect of it. Then we want to add more math features such as automatic graphing and markdown as well for simpler docs. The last feature is just to be able to upload an arbitrary pdf and convert it to latex, which would be very difficult and outside of thee scope of our project for these 2 days.
