module Test.Main where

import Prelude
import Control.Alternative (empty)
import Control.Cycle (CYCLE, run1, run2, run3, run4, run5)
import Control.Monad.Aff (Aff, runAff, makeAff, liftEff')
import Control.Monad.Aff.AVar (AVAR)
import Control.Monad.Aff.Console (CONSOLE)
import Control.Monad.Eff (Eff)
import Control.Monad.Eff.Exception (EXCEPTION)
import Control.Monad.Eff.Ref (readRef, modifyRef, newRef, REF)
import Control.XStream (STREAM, Stream, fromArray, addListener)
import Data.Array (snoc)
import Data.Either (fromRight)
import Data.Tuple.Nested (tuple2, tuple3, tuple4, tuple5)
import Partial.Unsafe (unsafePartial)
import Test.Unit (Test, test, suite)
import Test.Unit.Assert (equal)
import Test.Unit.Console (TESTOUTPUT)
import Test.Unit.Main (runTest)

arrayFromStream :: forall e a. Stream a -> Aff (ref :: REF, stream :: STREAM | e) (Array a)
arrayFromStream s = makeAff \reject resolve -> do
  ref <- newRef empty
  addListener
    { next: \a -> modifyRef ref $ flip snoc a
    , error: reject
    , complete: pure $ resolve =<< readRef ref
    }
    s

expectStream :: forall e a.
  (Eq a , Show a) => Array a -> Stream a -> Test (ref :: REF, stream :: STREAM, console :: CONSOLE | e)
expectStream xs a =
  equal xs =<< arrayFromStream a

liftEff'' :: forall e a. Eff (err :: EXCEPTION | e) a -> Aff e a
liftEff'' = map (unsafePartial fromRight) <$> liftEff'

main :: forall e.
  Eff
    ( console :: CONSOLE
    , testOutput :: TESTOUTPUT
    , avar :: AVAR
    , cycle :: CYCLE
    , ref :: REF
    , stream :: STREAM
    | e
    )
    Unit
main = runTest do
  suite "Cycle" do
    test "run1" do
      makeAff \reject resolve ->
        run1
          (\_ -> fromArray [1,2,3])
          (\sink -> void $ runAff reject resolve $ expectStream [1,2,3] sink)
    test "run2" do
      makeAff \reject resolve ->
        run2
          (\a b -> tuple2 (fromArray [1,2,3]) (fromArray [4,5,6]))
          $ tuple2
            (\sink -> void $ runAff reject resolve $ expectStream [1,2,3] sink)
            (\sink -> void $ runAff reject resolve $ expectStream [4,5,6] sink)
    test "run3" do
      makeAff \reject resolve ->
        run3
          (\a b c -> tuple3 (fromArray [1,2,3]) (fromArray [4,5,6]) (fromArray [7,8,9]))
          $ tuple3
            (\sink -> void $ runAff reject resolve $ expectStream [1,2,3] sink)
            (\sink -> void $ runAff reject resolve $ expectStream [4,5,6] sink)
            (\sink -> void $ runAff reject resolve $ expectStream [7,8,9] sink)
    test "run4" do
      makeAff \reject resolve ->
        run4
          (\a b c d -> tuple4 (fromArray [1,2,3]) (fromArray [4,5,6]) (fromArray [7,8,9]) (fromArray [10,11,12]))
          $ tuple4
            (\sink -> void $ runAff reject resolve $ expectStream [1,2,3] sink)
            (\sink -> void $ runAff reject resolve $ expectStream [4,5,6] sink)
            (\sink -> void $ runAff reject resolve $ expectStream [7,8,9] sink)
            (\sink -> void $ runAff reject resolve $ expectStream [10,11,12] sink)
    test "run5" do
      makeAff \reject resolve ->
        run5
          (\a b c d e -> tuple5 (fromArray [1,2,3]) (fromArray [4,5,6]) (fromArray [7,8,9]) (fromArray [10,11,12]) (fromArray [13,14,15]))
          $ tuple5
            (\sink -> void $ runAff reject resolve $ expectStream [1,2,3] sink)
            (\sink -> void $ runAff reject resolve $ expectStream [4,5,6] sink)
            (\sink -> void $ runAff reject resolve $ expectStream [7,8,9] sink)
            (\sink -> void $ runAff reject resolve $ expectStream [10,11,12] sink)
            (\sink -> void $ runAff reject resolve $ expectStream [13,14,15] sink)
