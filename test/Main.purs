module Test.Main where

import Prelude

import Control.Alt ((<|>))
import Control.Alternative (empty)
import Control.Cycle (run, runRecord)
import Control.Monad.Aff (Aff, Canceler(Canceler), makeAff, runAff)
import Control.Monad.Eff (Eff)
import Control.Monad.Eff.Class (liftEff)
import Control.Monad.Eff.Console (log)
import Control.Monad.Eff.Ref (modifyRef, newRef, readRef)
import Control.XStream (Stream, addListener, fromArray)
import Data.Array (snoc)
import Data.Either (Either(Right, Left))
import Data.Monoid (mempty)
import Test.Unit (success, suite, test)
import Test.Unit.Assert (equal)
import Test.Unit.Main (runTest)

arrayFromStream :: forall a. Stream a -> Aff _ (Array a)
arrayFromStream s = makeAff \cb -> do
  ref <- newRef empty
  cancel <- addListener
    { next: \a -> modifyRef ref $ flip snoc a
    , error: cb <<< Left
    , complete: pure $ cb <<< Right =<< readRef ref
    }
    s
  pure $ Canceler (const $ pure cancel)

expectStream :: forall a. Eq a => Show a => Array a -> Stream a -> Aff _ Unit
expectStream xs a =
  equal xs =<< arrayFromStream a

main :: Eff _ Unit
main = runTest do
  suite "Cycle" do
    test "test" do
      expectStream [1] (fromArray [1])
    test "run" do
      makeAff \cb -> do
        dispose <- run
          (\sink -> (_ * 2) <$> sink <|> fromArray [1,2,3])
          (\sink -> do
            _ <- runAff cb success
            pure mempty
          )
        pure $ Canceler (const $ liftEff $ dispose unit)
    test "runRecord" do
      makeAff \cb -> do
        let drivers =
              { a: \sink -> do
                  _ <- runAff cb success
                  pure $ fromArray [4,5,6]
              , b: const $ pure unit
              } :: { a :: Stream Int -> Eff _ (Stream Int), b :: Stream Unit -> Eff _ Unit }
        let main' sources =
              { a: fromArray [1,2,3] <|> sources.a
              , b: fromArray [unit]
              } :: { a :: Stream Int, b :: Stream Unit }
        dispose <- runRecord
          main'
          drivers
        pure $ Canceler (const $ liftEff $ dispose unit)
